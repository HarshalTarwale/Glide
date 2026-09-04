import "server-only";

import { withTenant } from "@/lib/db/tenant-client";
import { on } from "@/server/core/events";
import { getSystemAccounts } from "./accounts";
import { postJournalEntryDirect } from "./journal-entries";

/**
 * The first real subscriber to P4's domain event bus -- exactly what
 * docs/architecture.md §5.5 built it for: "posting an invoice emits an
 * event that nothing yet subscribes to... this is what lets a double-entry
 * GL module get added in P6+ purely as a new subscriber, without ever
 * touching invoicing code again." invoices.ts, credit-notes.ts and
 * payments.ts are untouched by this file.
 *
 * Each handler is idempotent via JournalEntry's
 * (tenantId, sourceType, sourceId) unique constraint -- checked explicitly
 * first (cheaper and gives a clearer skip-reason than relying on the DB
 * to reject a duplicate insert), so a retried or duplicate event can never
 * post the same source twice.
 *
 * Every handler is wrapped in its own try/catch even though events.ts's
 * emit() already swallows a throwing listener -- so ONE failing posting
 * (e.g. a tenant whose chart of accounts hasn't been bootstrapped yet)
 * logs clearly with which document it was trying to post for, rather than
 * a bare stack trace from inside the event bus.
 */

async function alreadyPosted(tenantId: string, sourceType: string, sourceId: string): Promise<boolean> {
  return withTenant(tenantId, async (tx) => {
    const existing = await tx.journalEntry.findUnique({
      where: { tenantId_sourceType_sourceId: { tenantId, sourceType, sourceId } },
    });
    return existing !== null;
  });
}

export function registerGLSubscriber(): void {
  // A deliberate, permanent log line, not debug noise: this is the one
  // place that confirms src/instrumentation.ts's register() hook actually
  // ran -- the one part of this module a live-DB test cannot prove on its
  // own, since a test calls registerGLSubscriber() directly rather than
  // going through Next's own startup lifecycle. An operator (or this
  // session's own smoke test) can grep server startup logs for this line
  // to know GL auto-posting is live, not just that the code compiles.
  console.log("[gl-subscriber] registered: invoice.posted, payment.recorded, creditnote.issued");

  on("invoice.posted", async (event) => {
    try {
      if (await alreadyPosted(event.tenantId, "Invoice", event.invoiceId)) return;

      await withTenant(event.tenantId, async (tx) => {
        const invoice = await tx.invoice.findUniqueOrThrow({ where: { id: event.invoiceId } });
        const subtotal = Number(invoice.subtotal.toString());
        const taxTotal = Number(invoice.taxTotal.toString());
        const total = Number(invoice.total.toString());

        const keys = taxTotal > 0 ? (["accounts_receivable", "sales_revenue", "tax_payable"] as const) : (["accounts_receivable", "sales_revenue"] as const);
        const accounts = await getSystemAccounts(tx, event.tenantId, event.companyId, [...keys]);

        const lines = [
          { accountId: accounts.accounts_receivable.id, debit: total, credit: 0, partnerId: event.partnerId, description: `Invoice ${invoice.number}` },
          { accountId: accounts.sales_revenue.id, debit: 0, credit: subtotal, description: `Invoice ${invoice.number}` },
        ];
        if (taxTotal > 0) {
          lines.push({ accountId: accounts.tax_payable.id, debit: 0, credit: taxTotal, description: `Invoice ${invoice.number} — tax` } as (typeof lines)[number]);
        }

        await postJournalEntryDirect(tx, {
          tenantId: event.tenantId,
          companyId: event.companyId,
          date: new Date(event.postedAt),
          description: `Invoice ${invoice.number}`,
          sourceType: "Invoice",
          sourceId: event.invoiceId,
          lines,
        });
      });
    } catch (err) {
      console.error(`[gl-subscriber] failed to post invoice.posted for invoice ${event.invoiceId}`, err);
    }
  });

  on("payment.recorded", async (event) => {
    try {
      if (await alreadyPosted(event.tenantId, "Payment", event.paymentId)) return;

      await withTenant(event.tenantId, async (tx) => {
        const accounts = await getSystemAccounts(tx, event.tenantId, event.companyId, ["cash", "accounts_receivable"]);
        await postJournalEntryDirect(tx, {
          tenantId: event.tenantId,
          companyId: event.companyId,
          date: new Date(),
          description: `Payment received`,
          sourceType: "Payment",
          sourceId: event.paymentId,
          lines: [
            { accountId: accounts.cash.id, debit: event.amount, credit: 0, partnerId: event.partnerId },
            { accountId: accounts.accounts_receivable.id, debit: 0, credit: event.amount, partnerId: event.partnerId },
          ],
        });
      });
    } catch (err) {
      console.error(`[gl-subscriber] failed to post payment.recorded for payment ${event.paymentId}`, err);
    }
  });

  on("creditnote.issued", async (event) => {
    try {
      if (await alreadyPosted(event.tenantId, "CreditNote", event.creditNoteId)) return;

      await withTenant(event.tenantId, async (tx) => {
        const creditNote = await tx.creditNote.findUniqueOrThrow({
          where: { id: event.creditNoteId },
          include: { invoice: { select: { partnerId: true, number: true } } },
        });
        const subtotal = Number(creditNote.subtotal.toString());
        const taxTotal = Number(creditNote.taxTotal.toString());
        const total = Number(creditNote.total.toString());

        const keys = taxTotal > 0 ? (["accounts_receivable", "sales_revenue", "tax_payable"] as const) : (["accounts_receivable", "sales_revenue"] as const);
        const accounts = await getSystemAccounts(tx, event.tenantId, creditNote.companyId, [...keys]);

        // The exact reversal of the original invoice.posted entry, for the
        // credited amount: revenue and tax go down (debit), what the
        // customer owes goes down (credit) -- see this file's own header
        // for why this is a NEW entry, not an edit to the original.
        const lines = [
          { accountId: accounts.sales_revenue.id, debit: subtotal, credit: 0, description: `Credit note against ${creditNote.invoice.number}` },
        ];
        if (taxTotal > 0) {
          lines.push({ accountId: accounts.tax_payable.id, debit: taxTotal, credit: 0, description: `Credit note against ${creditNote.invoice.number} — tax` });
        }
        lines.push({
          accountId: accounts.accounts_receivable.id,
          debit: 0,
          credit: total,
          partnerId: creditNote.invoice.partnerId,
          description: `Credit note against ${creditNote.invoice.number}`,
        } as (typeof lines)[number]);

        await postJournalEntryDirect(tx, {
          tenantId: event.tenantId,
          companyId: creditNote.companyId,
          date: new Date(),
          description: `Credit note ${creditNote.number}`,
          sourceType: "CreditNote",
          sourceId: event.creditNoteId,
          lines,
        });
      });
    } catch (err) {
      console.error(`[gl-subscriber] failed to post creditnote.issued for credit note ${event.creditNoteId}`, err);
    }
  });
}
