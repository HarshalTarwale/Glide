import "server-only";

import { z } from "zod";
import { withTenant, type TenantTransaction } from "@/lib/db/tenant-client";
import { assertPermission } from "@/lib/auth/permissions";
import { nextDocumentNumber } from "@/server/core/numbering";
import { emit } from "@/server/core/events";
import type { RequestContext } from "@/server/context";

/**
 * Credit notes -- the ONLY mechanism for correcting a posted invoice
 * (docs/architecture.md §5.5, and invoices.ts's own header comment). A
 * credit note is created already final, the same way P3's Delivery is
 * created already `done`: there is no draft state to edit, because editing
 * one after the fact would recreate the exact immutability hole this
 * document exists to close.
 *
 * Amounts are prorated from the ORIGINAL invoice line's stored subtotal/tax
 * (by quantity fraction), not recomputed through the tax engine again --
 * a credit note reverses what was actually charged, which may not equal
 * what today's tax settings would produce if the rates have since changed.
 */

export interface CreditNoteLineDTO {
  id: string;
  invoiceLineId: string;
  description: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
  taxAmount: number;
  total: number;
}

export interface CreditNoteDTO {
  id: string;
  number: string;
  invoiceId: string;
  invoiceNumber: string;
  creditNoteDate: string;
  reason: string;
  subtotal: number;
  taxTotal: number;
  total: number;
  lines: CreditNoteLineDTO[];
}

const creditNoteLineInputSchema = z.object({
  invoiceLineId: z.uuid(),
  quantity: z.number().positive(),
});

export const createCreditNoteInputSchema = z.object({
  reason: z.string().min(1, "A reason is required").max(1000),
  lines: z.array(creditNoteLineInputSchema).min(1, "Credit at least one line"),
});
export type CreateCreditNoteInput = z.infer<typeof createCreditNoteInputSchema>;

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

async function alreadyCredited(tx: TenantTransaction, invoiceLineId: string): Promise<number> {
  const agg = await tx.creditNoteLine.aggregate({ where: { invoiceLineId }, _sum: { quantity: true } });
  return Number(agg._sum.quantity ?? 0);
}

export async function createCreditNote(
  ctx: RequestContext,
  invoiceId: string,
  input: CreateCreditNoteInput
): Promise<string> {
  assertPermission(ctx.permissions, "invoicing:creditnote:write");
  const data = createCreditNoteInputSchema.parse(input);

  const issued = await withTenant(ctx.tenantId, async (tx) => {
    const invoice = await tx.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
    if (invoice.postedAt === null) {
      throw new Error("Only a posted invoice can be credited -- a draft invoice's lines can simply be edited.");
    }
    if (invoice.status === "cancelled") {
      throw new Error("Cannot issue a credit note against a cancelled invoice.");
    }

    const number = await nextDocumentNumber(tx, ctx.tenantId, invoice.companyId, "credit_note");

    let subtotal = 0;
    let taxTotal = 0;
    const lineRows: {
      invoiceLineId: string;
      description: string;
      quantity: number;
      unitPrice: number;
      subtotal: number;
      taxAmount: number;
      total: number;
    }[] = [];

    for (const requested of data.lines) {
      const line = await tx.invoiceLine.findUniqueOrThrow({ where: { id: requested.invoiceLineId } });
      if (line.invoiceId !== invoiceId) {
        throw new Error("That line does not belong to this invoice.");
      }
      const originalQty = Number(line.quantity.toString());
      const credited = await alreadyCredited(tx, line.id);
      const remaining = round2(originalQty - credited);
      if (requested.quantity > remaining) {
        throw new Error(`Cannot credit ${requested.quantity} of "${line.description}" -- only ${remaining} remain creditable.`);
      }

      const ratio = requested.quantity / originalQty;
      const lineSubtotal = round2(Number(line.subtotal.toString()) * ratio);
      const lineTax = round2(Number(line.taxAmount.toString()) * ratio);
      const lineTotal = round2(lineSubtotal + lineTax);

      subtotal = round2(subtotal + lineSubtotal);
      taxTotal = round2(taxTotal + lineTax);
      lineRows.push({
        invoiceLineId: line.id,
        description: line.description,
        quantity: requested.quantity,
        unitPrice: Number(line.unitPrice.toString()),
        subtotal: lineSubtotal,
        taxAmount: lineTax,
        total: lineTotal,
      });
    }

    const creditNote = await tx.creditNote.create({
      data: {
        tenantId: ctx.tenantId,
        companyId: invoice.companyId,
        invoiceId,
        number,
        reason: data.reason,
        subtotal,
        taxTotal,
        total: round2(subtotal + taxTotal),
        createdBy: ctx.userId,
      },
    });

    for (const row of lineRows) {
      await tx.creditNoteLine.create({
        data: { tenantId: ctx.tenantId, creditNoteId: creditNote.id, ...row },
      });
    }

    await tx.auditLog.create({
      data: {
        tenantId: ctx.tenantId,
        entityType: "Invoice",
        entityId: invoiceId,
        action: "credited",
        actorId: ctx.userId,
        actorName: ctx.userName,
        changes: { creditNote: { from: null, to: number }, total: { from: null, to: creditNote.total.toString() } },
      },
    });

    return { id: creditNote.id, invoiceId, total: Number(creditNote.total.toString()) };
  });

  emit({ type: "creditnote.issued", tenantId: ctx.tenantId, creditNoteId: issued.id, invoiceId: issued.invoiceId, total: issued.total });

  return issued.id;
}

export async function listCreditNotesForInvoice(ctx: RequestContext, invoiceId: string): Promise<CreditNoteDTO[]> {
  assertPermission(ctx.permissions, "invoicing:creditnote:read");

  return withTenant(ctx.tenantId, async (tx) => {
    const rows = await tx.creditNote.findMany({
      where: { invoiceId },
      orderBy: { createdAt: "desc" },
      include: { invoice: { select: { number: true } }, lines: true },
    });

    return rows.map((r) => ({
      id: r.id,
      number: r.number,
      invoiceId: r.invoiceId,
      invoiceNumber: r.invoice.number,
      creditNoteDate: r.creditNoteDate.toISOString(),
      reason: r.reason,
      subtotal: Number(r.subtotal.toString()),
      taxTotal: Number(r.taxTotal.toString()),
      total: Number(r.total.toString()),
      lines: r.lines.map((l) => ({
        id: l.id,
        invoiceLineId: l.invoiceLineId,
        description: l.description,
        quantity: Number(l.quantity.toString()),
        unitPrice: Number(l.unitPrice.toString()),
        subtotal: Number(l.subtotal.toString()),
        taxAmount: Number(l.taxAmount.toString()),
        total: Number(l.total.toString()),
      })),
    }));
  });
}
