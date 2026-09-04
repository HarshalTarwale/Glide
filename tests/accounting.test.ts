import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { signup } from "@/server/core/signup";
import { withTenant } from "@/lib/db/tenant-client";
import { createPartner } from "@/server/core/partners";
import { createStandaloneInvoice, postInvoice, getInvoice } from "@/server/invoicing/invoices";
import { createCreditNote } from "@/server/invoicing/credit-notes";
import { recordPayment } from "@/server/invoicing/payments";
import { registerGLSubscriber } from "@/server/accounting/gl-subscriber";
import { listAccounts } from "@/server/accounting/accounts";
import {
  createJournalEntry,
  postJournalEntry,
  updateJournalEntryLines,
  deleteJournalEntry,
  getJournalEntry,
  listJournalEntries,
} from "@/server/accounting/journal-entries";
import { getTrialBalance, getIncomeStatement, getBalanceSheet } from "@/server/accounting/reports";
import type { RequestContext } from "@/server/context";
import { unionPermissions } from "@/lib/auth/permissions";

/**
 * THE ACCOUNTING/GL ACCEPTANCE GATE, confirmed with the user 2026-09-04:
 *
 *   the chart of accounts is seeded automatically, a manual journal entry
 *   can only be posted balanced and is immutable once posted, posting an
 *   invoice/recording a payment/issuing a credit note automatically posts
 *   the corresponding journal entry via the P4 domain event bus WITHOUT
 *   invoicing.ts/payments.ts/credit-notes.ts being touched, and the trial
 *   balance / income statement / balance sheet all reconcile against that
 *   activity.
 *
 * registerGLSubscriber() is normally called once by src/instrumentation.ts
 * at server startup; vitest never runs that file, so this suite calls it
 * itself, exactly the same "run once" contract a real server gives it.
 */

const hasDatabase =
  Boolean(process.env.DATABASE_URL) && !process.env.DATABASE_URL?.includes("placeholder");
const describeWithDb = hasDatabase ? describe : describe.skip;

/**
 * emit() is deliberately fire-and-forget (events.ts's own doc comment) --
 * a listener's async work is never awaited by the caller, so immediately
 * after postInvoice() resolves, gl-subscriber.ts's posting may not have
 * landed yet. Polling here, rather than awaiting inside emit(), is the
 * right side to absorb that: it keeps the production resilience Note
 * ("must never fail or slow down the transaction that triggered it")
 * intact and puts the "did the async side-effect happen" wait only where
 * a test actually needs it.
 */
async function waitFor<T>(fn: () => Promise<T | null | undefined>, timeoutMs = 15000): Promise<T> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const result = await fn();
    if (result) return result;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`waitFor timed out after ${timeoutMs}ms`);
}

async function makeOwnerContext(orgName: string) {
  const result = await signup({
    name: "Test Owner",
    email: `gl-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`,
    password: "password123",
    organisation: orgName,
    country: "IN",
  });
  if (!result.ok) throw new Error(result.error);

  return withTenant(result.tenantId, async (tx) => {
    const membership = await tx.membership.findFirstOrThrow({
      where: { tenantId: result.tenantId, userId: result.userId },
      include: { roles: { include: { role: true } } },
    });
    const roles = membership.roles.map((r) => r.role);
    const tenant = await tx.tenant.findUniqueOrThrow({ where: { id: result.tenantId } });
    await tx.company.updateMany({ where: { tenantId: result.tenantId }, data: { region: "Maharashtra" } });

    const ctx: RequestContext = {
      userId: result.userId,
      userName: "Test Owner",
      userEmail: "",
      tenantId: result.tenantId,
      tenantName: orgName,
      country: tenant.country,
      currency: tenant.currency,
      isOwner: true,
      permissions: unionPermissions(roles),
      recordScopes: [],
      availableTenants: [],
    };

    const uom = await tx.unitOfMeasure.findFirstOrThrow({ where: { tenantId: result.tenantId, code: "pcs" } });
    const taxCat = await tx.taxCategory.findFirstOrThrow({ where: { tenantId: result.tenantId, key: "standard" } });
    return { ctx, uomId: uom.id, taxCategoryId: taxCat.id };
  });
}

async function makeProduct(ctx: RequestContext, uomId: string, taxCategoryId: string, price: number) {
  return withTenant(ctx.tenantId, async (tx) => {
    const p = await tx.product.create({
      data: { tenantId: ctx.tenantId, sku: `GL-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, name: "GL Widget", uomId, taxCategoryId, salesPrice: price },
    });
    return p.id;
  });
}

describeWithDb("Accounting / GL", () => {
  beforeAll(() => {
    registerGLSubscriber();
  });

  const tenantIds: string[] = [];
  afterAll(async () => {
    const { prisma } = await import("@/lib/db/client");
    for (const id of tenantIds) await withTenant(id, (tx) => tx.tenant.delete({ where: { id } }));
    await prisma.$disconnect();
  });

  it("a new tenant's chart of accounts is seeded automatically with the eight system accounts", async () => {
    const { ctx } = await makeOwnerContext("Chart Seed Co");
    tenantIds.push(ctx.tenantId);

    const accounts = await listAccounts(ctx);
    const systemKeys = accounts.filter((a) => a.systemKey).map((a) => a.systemKey);
    expect(systemKeys.sort()).toEqual(
      ["accounts_payable", "accounts_receivable", "cash", "cost_of_goods_sold", "inventory_asset", "retained_earnings", "sales_revenue", "tax_payable"].sort()
    );
    expect(accounts.find((a) => a.systemKey === "accounts_receivable")!.type).toBe("asset");
    expect(accounts.find((a) => a.systemKey === "sales_revenue")!.type).toBe("revenue");
  });

  it("a manual journal entry can only be posted when it balances, and is immutable once posted", async () => {
    const { ctx } = await makeOwnerContext("Manual Entry Co");
    tenantIds.push(ctx.tenantId);
    const accounts = await listAccounts(ctx);
    const cash = accounts.find((a) => a.systemKey === "cash")!;
    const equity = accounts.find((a) => a.systemKey === "retained_earnings")!;

    // Unbalanced -- must be refused at creation-time validation isn't the
    // gate (createJournalEntry allows drafting freely); posting is.
    const entryId = await createJournalEntry(ctx, {
      date: new Date(),
      description: "Opening balance",
      lines: [
        { accountId: cash.id, debit: 1000, credit: 0 },
        { accountId: equity.id, debit: 0, credit: 900 },
      ],
    });
    await expect(postJournalEntry(ctx, entryId)).rejects.toThrow(/does not balance/);

    // Fix it, then post successfully.
    await updateJournalEntryLines(ctx, entryId, {
      date: new Date(),
      description: "Opening balance",
      lines: [
        { accountId: cash.id, debit: 1000, credit: 0 },
        { accountId: equity.id, debit: 0, credit: 1000 },
      ],
    });
    await postJournalEntry(ctx, entryId);

    const posted = await getJournalEntry(ctx, entryId);
    expect(posted!.status).toBe("posted");
    expect(posted!.totalDebit).toBe(1000);
    expect(posted!.totalCredit).toBe(1000);

    await expect(
      updateJournalEntryLines(ctx, entryId, { date: new Date(), description: "edit", lines: [{ accountId: cash.id, debit: 1, credit: 0 }, { accountId: equity.id, debit: 0, credit: 1 }] })
    ).rejects.toThrow(/immutable|draft/);
    await expect(deleteJournalEntry(ctx, entryId)).rejects.toThrow(/immutable|draft/);
    await expect(postJournalEntry(ctx, entryId)).rejects.toThrow(/Only a draft entry/);
  });

  it("posting an invoice automatically posts a balanced journal entry via the domain event bus, without invoicing.ts knowing GL exists", async () => {
    const { ctx, uomId, taxCategoryId } = await makeOwnerContext("Auto Post Co");
    tenantIds.push(ctx.tenantId);

    const partner = await createPartner(ctx, {
      name: "Auto Post Customer",
      kind: "company",
      isCustomer: true,
      isSupplier: false,
      paymentTermDays: 30,
      billingLine1: "1 Test Street",
      billingRegion: "Maharashtra",
      billingCountry: "IN",
    });
    const productId = await makeProduct(ctx, uomId, taxCategoryId, 1000);

    const invoiceId = await createStandaloneInvoice(ctx, { partnerId: partner.id, lines: [{ productId, quantity: 1, discountPct: 0 }] });
    await postInvoice(ctx, invoiceId);
    const invoice = await getInvoice(ctx, invoiceId);

    const entries = await waitFor(async () => {
      const page = await listJournalEntries(ctx, { page: 1, pageSize: 50, filters: [], sort: [] });
      const match = page.rows.find((r) => r.sourceType === "Invoice");
      return match ?? null;
    });

    const entry = await getJournalEntry(ctx, entries.id);
    expect(entry!.status).toBe("posted");
    expect(entry!.totalDebit).toBe(entry!.totalCredit);
    expect(entry!.totalDebit).toBe(invoice!.total);

    const accounts = await listAccounts(ctx);
    const arId = accounts.find((a) => a.systemKey === "accounts_receivable")!.id;
    const revId = accounts.find((a) => a.systemKey === "sales_revenue")!.id;

    const arLine = entry!.lines.find((l) => l.accountId === arId)!;
    const revLine = entry!.lines.find((l) => l.accountId === revId)!;
    expect(arLine.debit).toBe(invoice!.total);
    expect(revLine.credit).toBe(invoice!.subtotal);
  }, 60_000);

  it("recording a payment posts Dr Cash / Cr Accounts Receivable, and a credit note posts the reversal", async () => {
    const { ctx, uomId, taxCategoryId } = await makeOwnerContext("Payment Post Co");
    tenantIds.push(ctx.tenantId);

    const partner = await createPartner(ctx, {
      name: "Payment Post Customer",
      kind: "company",
      isCustomer: true,
      isSupplier: false,
      paymentTermDays: 30,
      billingLine1: "1 Test Street",
      billingRegion: "Maharashtra",
      billingCountry: "IN",
    });
    const productId = await makeProduct(ctx, uomId, taxCategoryId, 500);

    const invoiceId = await createStandaloneInvoice(ctx, { partnerId: partner.id, lines: [{ productId, quantity: 2, discountPct: 0 }] });
    await postInvoice(ctx, invoiceId);
    const invoice = await getInvoice(ctx, invoiceId);
    const invoiceLineId = invoice!.lines[0].id;

    await waitFor(async () => {
      const page = await listJournalEntries(ctx, { page: 1, pageSize: 50, filters: [], sort: [] });
      return page.rows.find((r) => r.sourceType === "Invoice") ?? null;
    });

    const paymentId = await recordPayment(ctx, {
      partnerId: partner.id,
      amount: 200,
      method: "bank_transfer",
      allocations: [{ invoiceId, amount: 200 }],
    });
    void paymentId;

    const accounts = await listAccounts(ctx);
    const cashId = accounts.find((a) => a.systemKey === "cash")!.id;
    const arId = accounts.find((a) => a.systemKey === "accounts_receivable")!.id;

    const paymentEntry = await waitFor(async () => {
      const page = await listJournalEntries(ctx, { page: 1, pageSize: 50, filters: [], sort: [] });
      const match = page.rows.find((r) => r.sourceType === "Payment");
      return match ? getJournalEntry(ctx, match.id) : null;
    });
    expect(paymentEntry!.lines.find((l) => l.accountId === cashId)!.debit).toBe(200);
    expect(paymentEntry!.lines.find((l) => l.accountId === arId)!.credit).toBe(200);

    await createCreditNote(ctx, invoiceId, { reason: "Damaged goods", lines: [{ invoiceLineId, quantity: 1 }] });

    const creditEntry = await waitFor(async () => {
      const page = await listJournalEntries(ctx, { page: 1, pageSize: 50, filters: [], sort: [] });
      const match = page.rows.find((r) => r.sourceType === "CreditNote");
      return match ? getJournalEntry(ctx, match.id) : null;
    });
    expect(creditEntry!.totalDebit).toBe(creditEntry!.totalCredit);
    // Half the invoice (1 of 2 units) credited -- half its revenue reversed.
    expect(creditEntry!.lines.find((l) => l.accountId === accounts.find((a) => a.systemKey === "sales_revenue")!.id)!.debit).toBe(500);
  }, 60_000);

  it("the trial balance, income statement and balance sheet all reconcile against posted activity", async () => {
    const { ctx, uomId, taxCategoryId } = await makeOwnerContext("Reports Co");
    tenantIds.push(ctx.tenantId);

    const partner = await createPartner(ctx, {
      name: "Reports Customer",
      kind: "company",
      isCustomer: true,
      isSupplier: false,
      paymentTermDays: 30,
      billingLine1: "1 Test Street",
      billingRegion: "Maharashtra",
      billingCountry: "IN",
    });
    const productId = await makeProduct(ctx, uomId, taxCategoryId, 2000);

    const invoiceId = await createStandaloneInvoice(ctx, { partnerId: partner.id, lines: [{ productId, quantity: 1, discountPct: 0 }] });
    await postInvoice(ctx, invoiceId);
    const invoice = await getInvoice(ctx, invoiceId);

    await waitFor(async () => {
      const page = await listJournalEntries(ctx, { page: 1, pageSize: 50, filters: [], sort: [] });
      return page.rows.find((r) => r.sourceType === "Invoice") ?? null;
    });

    const trialBalance = await getTrialBalance(ctx);
    expect(trialBalance.balanced).toBe(true);
    expect(trialBalance.totalDebit).toBe(trialBalance.totalCredit);

    const now = new Date();
    const yearStart = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
    const incomeStatement = await getIncomeStatement(ctx, yearStart, now);
    expect(incomeStatement.totalRevenue).toBe(invoice!.subtotal);
    expect(incomeStatement.netIncome).toBe(invoice!.subtotal);

    const balanceSheet = await getBalanceSheet(ctx, now);
    expect(balanceSheet.outOfBalance).toBe(0);
    expect(balanceSheet.totalAssets).toBe(invoice!.total);
  }, 60_000);
});
