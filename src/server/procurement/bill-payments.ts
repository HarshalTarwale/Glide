import "server-only";

import { z } from "zod";
import { withTenant, type TenantTransaction } from "@/lib/db/tenant-client";
import { assertPermission } from "@/lib/auth/permissions";
import { compileQuery } from "@/lib/query/prisma-query";
import type { RecordPage, RecordQuery } from "@/lib/query/record-query";
import { computeUnallocated, computeBillOutstanding } from "@/lib/procurement/bill-status";
import { nextDocumentNumber } from "@/server/core/numbering";
import { emit } from "@/server/core/events";
import { recomputeBillStatus } from "./bills";
import type { RequestContext } from "@/server/context";

/**
 * BillPayment and its allocation across bills — the buy-side mirror of
 * src/server/invoicing/payments.ts, same many-to-many shape (one payment
 * can settle parts of several bills, one bill can be settled by several
 * payments over time).
 */

export interface BillPaymentAllocationDTO {
  id: string;
  billId: string;
  billNumber: string;
  amount: number;
}

export interface BillPaymentDTO {
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
  allocations: BillPaymentAllocationDTO[];
}

const allocationInputSchema = z.object({ billId: z.uuid(), amount: z.number().positive() });

export const recordBillPaymentInputSchema = z.object({
  partnerId: z.uuid(),
  amount: z.number().positive(),
  currency: z.string().length(3).optional(),
  method: z.enum(["bank_transfer", "card", "cash", "cheque", "other"]).default("bank_transfer"),
  reference: z.string().max(200).nullish(),
  paymentDate: z.coerce.date().optional(),
  notes: z.string().max(2000).nullish(),
  allocations: z.array(allocationInputSchema).default([]),
});
export type RecordBillPaymentInput = z.infer<typeof recordBillPaymentInputSchema>;

export const allocateBillPaymentInputSchema = z.object({ allocations: z.array(allocationInputSchema).min(1) });
export type AllocateBillPaymentInput = z.infer<typeof allocateBillPaymentInputSchema>;

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

async function applyAllocations(
  tx: TenantTransaction,
  tenantId: string,
  billPaymentId: string,
  allocations: { billId: string; amount: number }[]
): Promise<void> {
  if (allocations.length === 0) return;

  const payment = await tx.billPayment.findUniqueOrThrow({ where: { id: billPaymentId } });
  const requestedTotal = round2(allocations.reduce((sum, a) => sum + a.amount, 0));
  const currentUnallocated = Number(payment.unallocatedAmount.toString());
  if (requestedTotal > currentUnallocated) {
    throw new Error(`Cannot allocate ${requestedTotal} -- only ${currentUnallocated} of this payment is unallocated.`);
  }

  for (const alloc of allocations) {
    const bill = await tx.bill.findUniqueOrThrow({ where: { id: alloc.billId } });
    if (bill.postedAt === null) {
      throw new Error(`"${bill.number}" is not posted yet and cannot receive a payment.`);
    }
    const outstanding = computeBillOutstanding(Number(bill.total.toString()), Number(bill.amountPaid.toString()));
    if (alloc.amount > outstanding) {
      throw new Error(`Cannot allocate ${alloc.amount} to "${bill.number}" -- only ${outstanding} is outstanding on it.`);
    }

    await tx.billPaymentAllocation.create({ data: { tenantId, billPaymentId, billId: alloc.billId, amount: alloc.amount } });
    await tx.bill.update({ where: { id: alloc.billId }, data: { amountPaid: { increment: alloc.amount } } });
    await recomputeBillStatus(tx, alloc.billId);
  }

  const allocatedTotal = await tx.billPaymentAllocation.aggregate({ where: { billPaymentId }, _sum: { amount: true } });
  await tx.billPayment.update({
    where: { id: billPaymentId },
    data: { unallocatedAmount: computeUnallocated(Number(payment.amount.toString()), Number(allocatedTotal._sum.amount ?? 0)) },
  });
}

export async function recordBillPayment(ctx: RequestContext, input: RecordBillPaymentInput): Promise<string> {
  assertPermission(ctx.permissions, "procurement:payment:write");
  const data = recordBillPaymentInputSchema.parse(input);

  const created = await withTenant(ctx.tenantId, async (tx) => {
    const [company, partner] = await Promise.all([
      tx.company.findFirstOrThrow({ where: { tenantId: ctx.tenantId }, orderBy: { createdAt: "asc" } }),
      tx.partner.findUniqueOrThrow({ where: { id: data.partnerId } }),
    ]);

    const number = await nextDocumentNumber(tx, ctx.tenantId, company.id, "bill_payment");
    const currency = data.currency ?? partner.currency ?? company.currency;

    const payment = await tx.billPayment.create({
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
      data: { tenantId: ctx.tenantId, entityType: "BillPayment", entityId: payment.id, action: "recorded", actorId: ctx.userId, actorName: ctx.userName, changes: { number: { from: null, to: number } } },
    });

    return { id: payment.id, companyId: company.id, partnerId: data.partnerId, amount: data.amount, currency };
  });

  emit({ type: "billpayment.recorded", tenantId: ctx.tenantId, billPaymentId: created.id, companyId: created.companyId, partnerId: created.partnerId, amount: created.amount, currency: created.currency });

  return created.id;
}

export async function allocateBillPayment(ctx: RequestContext, billPaymentId: string, input: AllocateBillPaymentInput): Promise<void> {
  assertPermission(ctx.permissions, "procurement:payment:write");
  const data = allocateBillPaymentInputSchema.parse(input);

  await withTenant(ctx.tenantId, async (tx) => {
    await applyAllocations(tx, ctx.tenantId, billPaymentId, data.allocations);
    await tx.auditLog.create({
      data: { tenantId: ctx.tenantId, entityType: "BillPayment", entityId: billPaymentId, action: "allocated", actorId: ctx.userId, actorName: ctx.userName },
    });
  });
}

export async function getBillPayment(ctx: RequestContext, id: string): Promise<BillPaymentDTO | null> {
  assertPermission(ctx.permissions, "procurement:payment:read");

  return withTenant(ctx.tenantId, async (tx) => {
    const payment = await tx.billPayment.findUnique({
      where: { id },
      include: { partner: { select: { name: true } }, allocations: { include: { bill: { select: { number: true } } } } },
    });
    if (!payment) return null;
    return toDTO(payment);
  });
}

const SEARCH_FIELDS = ["number", "partner.name", "reference"];
const ALLOWED_FIELDS = ["number", "paymentDate", "amount", "partner.name"];

export interface BillPaymentListItemDTO {
  id: string;
  number: string;
  partnerName: string;
  paymentDate: string;
  method: string;
  amount: number;
  currency: string;
  unallocatedAmount: number;
}

export async function listBillPayments(ctx: RequestContext, query: RecordQuery): Promise<RecordPage<BillPaymentListItemDTO>> {
  assertPermission(ctx.permissions, "procurement:payment:read");

  const compiled = compileQuery(query, { searchFields: SEARCH_FIELDS, allowedFields: ALLOWED_FIELDS });

  return withTenant(ctx.tenantId, async (tx) => {
    const [rows, total] = await Promise.all([
      tx.billPayment.findMany({ where: compiled.where, orderBy: compiled.orderBy, skip: compiled.skip, take: compiled.take, include: { partner: { select: { name: true } } } }),
      tx.billPayment.count({ where: compiled.where }),
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

function toDTO(payment: {
  id: string;
  number: string;
  partnerId: string;
  partner: { name: string };
  paymentDate: Date;
  method: string;
  reference: string | null;
  amount: { toString(): string };
  currency: string;
  unallocatedAmount: { toString(): string };
  notes: string | null;
  allocations: { id: string; billId: string; bill: { number: string }; amount: { toString(): string } }[];
}): BillPaymentDTO {
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
    allocations: payment.allocations.map((a) => ({ id: a.id, billId: a.billId, billNumber: a.bill.number, amount: Number(a.amount.toString()) })),
  };
}

/** Open (posted, not fully paid) bills for one supplier -- the standalone multi-bill payment flow's picker, mirroring invoicing's getOpenInvoicesForPartnerAction. */
export interface OpenBillDTO {
  id: string;
  number: string;
  total: number;
  outstanding: number;
  currency: string;
}

export async function getOpenBillsForPartner(ctx: RequestContext, partnerId: string): Promise<OpenBillDTO[]> {
  assertPermission(ctx.permissions, "procurement:bill:read");

  return withTenant(ctx.tenantId, async (tx) => {
    const rows = await tx.bill.findMany({ where: { partnerId, status: { in: ["posted", "partially_paid"] } }, orderBy: { billDate: "asc" } });
    return rows
      .map((r) => {
        const total = Number(r.total.toString());
        const amountPaid = Number(r.amountPaid.toString());
        return { id: r.id, number: r.number, total, outstanding: computeBillOutstanding(total, amountPaid), currency: r.currency };
      })
      .filter((b) => b.outstanding > 0);
  });
}
