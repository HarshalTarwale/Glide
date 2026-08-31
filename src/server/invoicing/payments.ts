import "server-only";

import { z } from "zod";
import { withTenant, type TenantTransaction } from "@/lib/db/tenant-client";
import { assertPermission } from "@/lib/auth/permissions";
import { compileQuery } from "@/lib/query/prisma-query";
import type { RecordPage, RecordQuery } from "@/lib/query/record-query";
import { computeUnallocated, computeInvoiceOutstanding } from "@/lib/invoicing/invoice-status";
import { nextDocumentNumber } from "@/server/core/numbering";
import { emit } from "@/server/core/events";
import { recomputeInvoiceStatus } from "./invoices";
import type { RequestContext } from "@/server/context";

/**
 * Payments and their allocation across invoices -- the many-to-many the
 * roadmap's acceptance bar names explicitly: "one payment can settle parts
 * of three invoices." A payment can also arrive before the invoice it will
 * eventually settle (Payment.unallocatedAmount sits positive until then),
 * matching Payment's own schema doc comment.
 */

export interface PaymentAllocationDTO {
  id: string;
  invoiceId: string;
  invoiceNumber: string;
  amount: number;
}

export interface PaymentDTO {
  id: string;
  number: string;
  partnerId: string;
  partnerName: string;
  paymentDate: string;
  method: string;
  reference: string | null;
  amount: number;
  currency: string;
  unallocatedAmount: number;
  notes: string | null;
  allocations: PaymentAllocationDTO[];
}

const allocationInputSchema = z.object({
  invoiceId: z.uuid(),
  amount: z.number().positive(),
});

export const recordPaymentInputSchema = z.object({
  partnerId: z.uuid(),
  amount: z.number().positive(),
  currency: z.string().length(3).optional(),
  method: z.enum(["bank_transfer", "card", "cash", "cheque", "other"]).default("bank_transfer"),
  reference: z.string().max(200).nullish(),
  paymentDate: z.coerce.date().optional(),
  notes: z.string().max(2000).nullish(),
  /** Applied immediately, in the same transaction as recording the payment. */
  allocations: z.array(allocationInputSchema).default([]),
});
export type RecordPaymentInput = z.infer<typeof recordPaymentInputSchema>;

export const allocatePaymentInputSchema = z.object({
  allocations: z.array(allocationInputSchema).min(1),
});
export type AllocatePaymentInput = z.infer<typeof allocatePaymentInputSchema>;

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Applies a batch of allocations against an already-locked payment row.
 * Shared by recordPayment (allocate at creation time) and allocatePayment
 * (allocate against an existing payment later) so the two never drift.
 */
async function applyAllocations(
  tx: TenantTransaction,
  tenantId: string,
  paymentId: string,
  allocations: { invoiceId: string; amount: number }[]
): Promise<void> {
  if (allocations.length === 0) return;

  const payment = await tx.payment.findUniqueOrThrow({ where: { id: paymentId } });
  const requestedTotal = round2(allocations.reduce((sum, a) => sum + a.amount, 0));
  const currentUnallocated = Number(payment.unallocatedAmount.toString());
  if (requestedTotal > currentUnallocated) {
    throw new Error(`Cannot allocate ${requestedTotal} -- only ${currentUnallocated} of this payment is unallocated.`);
  }

  for (const alloc of allocations) {
    const invoice = await tx.invoice.findUniqueOrThrow({ where: { id: alloc.invoiceId } });
    if (invoice.postedAt === null) {
      throw new Error(`"${invoice.number}" is not posted yet and cannot receive a payment.`);
    }
    const outstanding = computeInvoiceOutstanding(Number(invoice.total.toString()), Number(invoice.amountPaid.toString()));
    if (alloc.amount > outstanding) {
      throw new Error(`Cannot allocate ${alloc.amount} to "${invoice.number}" -- only ${outstanding} is outstanding on it.`);
    }

    await tx.paymentAllocation.create({
      data: { tenantId, paymentId, invoiceId: alloc.invoiceId, amount: alloc.amount },
    });
    await tx.invoice.update({
      where: { id: alloc.invoiceId },
      data: { amountPaid: { increment: alloc.amount } },
    });
    await recomputeInvoiceStatus(tx, alloc.invoiceId);
  }

  // Recomputed from the full ledger of allocations, not by subtracting a
  // delta from the old unallocatedAmount -- the same "cache is derived, not
  // incrementally patched" discipline as StockQuant and every status field
  // in this codebase, so a partial failure or a future correction can never
  // leave this column silently wrong.
  const allocatedTotal = await tx.paymentAllocation.aggregate({ where: { paymentId }, _sum: { amount: true } });
  await tx.payment.update({
    where: { id: paymentId },
    data: { unallocatedAmount: computeUnallocated(Number(payment.amount.toString()), Number(allocatedTotal._sum.amount ?? 0)) },
  });
}

export async function recordPayment(ctx: RequestContext, input: RecordPaymentInput): Promise<string> {
  assertPermission(ctx.permissions, "invoicing:payment:write");
  const data = recordPaymentInputSchema.parse(input);

  const created = await withTenant(ctx.tenantId, async (tx) => {
    const [company, partner] = await Promise.all([
      tx.company.findFirstOrThrow({ where: { tenantId: ctx.tenantId }, orderBy: { createdAt: "asc" } }),
      tx.partner.findUniqueOrThrow({ where: { id: data.partnerId } }),
    ]);

    const number = await nextDocumentNumber(tx, ctx.tenantId, company.id, "payment");
    const currency = data.currency ?? partner.currency ?? company.currency;

    const payment = await tx.payment.create({
      data: {
        tenantId: ctx.tenantId,
        companyId: company.id,
        partnerId: data.partnerId,
        number,
        paymentDate: data.paymentDate ?? new Date(),
        method: data.method,
        reference: data.reference ?? null,
        amount: data.amount,
        currency,
        unallocatedAmount: data.amount,
        notes: data.notes ?? null,
        createdBy: ctx.userId,
      },
    });

    await applyAllocations(tx, ctx.tenantId, payment.id, data.allocations);

    await tx.auditLog.create({
      data: {
        tenantId: ctx.tenantId,
        entityType: "Payment",
        entityId: payment.id,
        action: "recorded",
        actorId: ctx.userId,
        actorName: ctx.userName,
        changes: { number: { from: null, to: number }, amount: { from: null, to: data.amount.toString() } },
      },
    });

    return { id: payment.id, companyId: company.id, partnerId: data.partnerId, amount: data.amount, currency };
  });

  emit({ type: "payment.recorded", tenantId: ctx.tenantId, paymentId: created.id, companyId: created.companyId, partnerId: created.partnerId, amount: created.amount, currency: created.currency });

  return created.id;
}

export async function allocatePayment(ctx: RequestContext, paymentId: string, input: AllocatePaymentInput): Promise<void> {
  assertPermission(ctx.permissions, "invoicing:payment:write");
  const data = allocatePaymentInputSchema.parse(input);

  await withTenant(ctx.tenantId, async (tx) => {
    await applyAllocations(tx, ctx.tenantId, paymentId, data.allocations);

    await tx.auditLog.create({
      data: {
        tenantId: ctx.tenantId,
        entityType: "Payment",
        entityId: paymentId,
        action: "allocated",
        actorId: ctx.userId,
        actorName: ctx.userName,
      },
    });
  });
}

export async function getPayment(ctx: RequestContext, id: string): Promise<PaymentDTO | null> {
  assertPermission(ctx.permissions, "invoicing:payment:read");

  return withTenant(ctx.tenantId, async (tx) => {
    const payment = await tx.payment.findUnique({
      where: { id },
      include: {
        partner: { select: { name: true } },
        allocations: { include: { invoice: { select: { number: true } } } },
      },
    });
    if (!payment) return null;

    return {
      id: payment.id,
      number: payment.number,
      partnerId: payment.partnerId,
      partnerName: payment.partner.name,
      paymentDate: payment.paymentDate.toISOString(),
      method: payment.method,
      reference: payment.reference,
      amount: Number(payment.amount.toString()),
      currency: payment.currency,
      unallocatedAmount: Number(payment.unallocatedAmount.toString()),
      notes: payment.notes,
      allocations: payment.allocations.map((a) => ({
        id: a.id,
        invoiceId: a.invoiceId,
        invoiceNumber: a.invoice.number,
        amount: Number(a.amount.toString()),
      })),
    };
  });
}

export interface PaymentListItemDTO {
  id: string;
  number: string;
  partnerName: string;
  paymentDate: string;
  method: string;
  amount: number;
  currency: string;
  unallocatedAmount: number;
}

const PAYMENT_SEARCH_FIELDS = ["number", "partner.name", "reference"];
const PAYMENT_ALLOWED_FIELDS = ["number", "paymentDate", "amount", "partner.name"];

export async function listPayments(ctx: RequestContext, query: RecordQuery): Promise<RecordPage<PaymentListItemDTO>> {
  assertPermission(ctx.permissions, "invoicing:payment:read");

  const compiled = compileQuery(query, {
    searchFields: PAYMENT_SEARCH_FIELDS,
    allowedFields: PAYMENT_ALLOWED_FIELDS,
  });

  return withTenant(ctx.tenantId, async (tx) => {
    const [rows, total] = await Promise.all([
      tx.payment.findMany({
        where: compiled.where,
        orderBy: compiled.orderBy,
        skip: compiled.skip,
        take: compiled.take,
        include: { partner: { select: { name: true } } },
      }),
      tx.payment.count({ where: compiled.where }),
    ]);

    return {
      rows: rows.map((r) => ({
        id: r.id,
        number: r.number,
        partnerName: r.partner.name,
        paymentDate: r.paymentDate.toISOString(),
        method: r.method,
        amount: Number(r.amount.toString()),
        currency: r.currency,
        unallocatedAmount: Number(r.unallocatedAmount.toString()),
      })),
      total,
      page: query.page,
      pageSize: compiled.take,
    };
  });
}

export async function listPaymentsForPartner(ctx: RequestContext, partnerId: string): Promise<PaymentDTO[]> {
  assertPermission(ctx.permissions, "invoicing:payment:read");

  return withTenant(ctx.tenantId, async (tx) => {
    const rows = await tx.payment.findMany({
      where: { partnerId },
      orderBy: { paymentDate: "desc" },
      include: {
        partner: { select: { name: true } },
        allocations: { include: { invoice: { select: { number: true } } } },
      },
    });

    return rows.map((payment) => ({
      id: payment.id,
      number: payment.number,
      partnerId: payment.partnerId,
      partnerName: payment.partner.name,
      paymentDate: payment.paymentDate.toISOString(),
      method: payment.method,
      reference: payment.reference,
      amount: Number(payment.amount.toString()),
      currency: payment.currency,
      unallocatedAmount: Number(payment.unallocatedAmount.toString()),
      notes: payment.notes,
      allocations: payment.allocations.map((a) => ({
        id: a.id,
        invoiceId: a.invoiceId,
        invoiceNumber: a.invoice.number,
        amount: Number(a.amount.toString()),
      })),
    }));
  });
}
