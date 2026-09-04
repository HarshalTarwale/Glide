import "server-only";

import { z } from "zod";
import { withTenant, type TenantTransaction } from "@/lib/db/tenant-client";
import { assertPermission, recordScopeWhere } from "@/lib/auth/permissions";
import { compileQuery } from "@/lib/query/prisma-query";
import type { RecordPage, RecordQuery } from "@/lib/query/record-query";
import { computeTax } from "@/lib/tax";
import type { TaxParty, TaxableLine, JurisdictionRate } from "@/lib/tax";
import { deriveBillStatus, computeBillLineSubtotal, type BillStatus } from "@/lib/procurement/bill-status";
import { deriveStatus as deriveOrderStatus } from "@/lib/procurement/order-status";
import { nextDocumentNumber } from "@/server/core/numbering";
import { emit } from "@/server/core/events";
import type { RequestContext } from "@/server/context";

/**
 * Bill service — the buy-side mirror of src/server/invoicing/invoices.ts.
 * Every rule restates that file's own: header status is DERIVED
 * (bill-status.ts), a posted bill is immutable (no code path here edits
 * one -- v1 has no debit note, see procurement.prisma's own scope note),
 * and the tax breakdown is frozen at posting (Bill.taxBreakdown) rather
 * than recomputed forever, identical reasoning to Invoice.taxBreakdown.
 *
 * The one real structural difference: the SUPPLIER is the seller of
 * record for tax purposes here (they charge us), so resolveSellerParty
 * resolves the Partner and resolveBuyerParty resolves our own Company --
 * exactly reversed from invoices.ts, restated rather than reused because
 * the two documents' tax direction is genuinely opposite, not a copy that
 * happened to diverge.
 */

/* ------------------------------------------------------------------ */
/* DTOs                                                                 */
/* ------------------------------------------------------------------ */

export interface BillLineDTO {
  id: string;
  sequence: number;
  productId: string;
  productSku: string;
  productName: string;
  description: string;
  uomCode: string;
  quantity: number;
  unitCost: number;
  discountPct: number;
  taxLabel: string;
  taxAmount: number;
  subtotal: number;
  total: number;
  purchaseOrderLineId: string | null;
}

export interface BillDTO {
  id: string;
  number: string;
  status: BillStatus;
  partnerId: string;
  partnerName: string;
  currency: string;
  purchaseOrderId: string | null;
  purchaseOrderNumber: string | null;
  billDate: string;
  dueDate: string | null;
  postedAt: string | null;
  subtotal: number;
  taxTotal: number;
  total: number;
  amountPaid: number;
  outstanding: number;
  notes: string | null;
  taxComponents: { label: string; rate: number; amount: number }[];
  lines: BillLineDTO[];
}

export interface BillListItemDTO {
  id: string;
  number: string;
  status: BillStatus;
  partnerName: string;
  billDate: string;
  dueDate: string | null;
  total: number;
  amountPaid: number;
  outstanding: number;
}

const SEARCH_FIELDS = ["number", "partner.name"];
const ALLOWED_FIELDS = ["number", "status", "billDate", "dueDate", "total", "partner.name"];

/* ------------------------------------------------------------------ */
/* Input contracts                                                     */
/* ------------------------------------------------------------------ */

const billLineInputSchema = z.object({
  productId: z.uuid(),
  quantity: z.number().positive(),
  unitCost: z.number().min(0).optional(),
  discountPct: z.number().min(0).max(100).default(0),
  purchaseOrderLineId: z.uuid().nullish(),
});

export const createStandaloneBillInputSchema = z.object({
  partnerId: z.uuid(),
  dueDate: z.coerce.date().nullish(),
  notes: z.string().max(2000).nullish(),
  lines: z.array(billLineInputSchema).min(1, "Add at least one line"),
});
export type CreateStandaloneBillInput = z.infer<typeof createStandaloneBillInputSchema>;

export const createBillFromOrderInputSchema = z.object({
  dueDate: z.coerce.date().nullish(),
  notes: z.string().max(2000).nullish(),
  lines: z.array(z.object({ purchaseOrderLineId: z.uuid(), quantity: z.number().positive() })).min(1),
});
export type CreateBillFromOrderInput = z.infer<typeof createBillFromOrderInputSchema>;

/* ------------------------------------------------------------------ */
/* Tax resolution — seller/buyer REVERSED from invoicing (see header). */
/* ------------------------------------------------------------------ */

async function resolveSellerParty(tx: TenantTransaction, partnerId: string): Promise<TaxParty> {
  const [address, taxInfo] = await Promise.all([
    tx.partnerAddress.findFirst({ where: { partnerId, kind: "billing" }, orderBy: { isDefault: "desc" } }),
    tx.partnerTaxInfo.findFirst({ where: { partnerId }, orderBy: { createdAt: "asc" } }),
  ]);
  return {
    address: { country: address?.country ?? "IN", region: address?.region ?? undefined, city: address?.city ?? undefined },
    taxId: taxInfo?.taxId,
    isRegistered: taxInfo?.isRegistered ?? false,
  };
}

async function resolveBuyerParty(tx: TenantTransaction, companyId: string): Promise<TaxParty> {
  const company = await tx.company.findUniqueOrThrow({ where: { id: companyId } });
  return {
    address: { country: company.country, region: company.region ?? undefined, city: company.city ?? undefined },
    taxId: company.taxId ?? undefined,
    isRegistered: Boolean(company.taxId),
  };
}

async function resolveConfiguredRates(tx: TenantTransaction, tenantId: string): Promise<JurisdictionRate[]> {
  const rows = await tx.taxRate.findMany({ where: { tenantId, isActive: true }, include: { taxCategory: { select: { key: true } } } });
  return rows.map((r) => ({
    name: r.name,
    rate: Number(r.rate.toString()),
    level: r.level as JurisdictionRate["level"],
    region: r.region ?? undefined,
    category: r.taxCategory?.key as JurisdictionRate["category"],
  }));
}

async function resolveUnitCost(tx: TenantTransaction, productId: string): Promise<number> {
  const product = await tx.product.findUniqueOrThrow({ where: { id: productId }, select: { costPrice: true } });
  return Number(product.costPrice.toString());
}

/** Live for a draft (still editable); frozen (Bill.taxBreakdown) once posted -- see this file's header comment. */
async function computeLiveTaxComponents(
  tx: TenantTransaction,
  tenantId: string,
  partnerId: string,
  companyId: string,
  lines: { id: string; subtotal: { toString(): string }; taxCategory: { key: string } | null }[]
): Promise<{ label: string; rate: number; amount: number }[]> {
  const [seller, buyer] = await Promise.all([resolveSellerParty(tx, partnerId), resolveBuyerParty(tx, companyId)]);
  const taxableLines: TaxableLine[] = lines.map((l) => ({
    id: l.id,
    amount: Number(l.subtotal.toString()),
    category: (l.taxCategory?.key as TaxableLine["category"]) ?? "standard",
  }));
  const configuredRates = await resolveConfiguredRates(tx, tenantId);
  const taxResult = computeTax({ lines: taxableLines, seller, buyer, settings: { rates: configuredRates } });
  return taxResult.components.map((c) => ({ label: c.label, rate: c.rate, amount: c.amount }));
}

/* ------------------------------------------------------------------ */
/* Recompute: totals only.                                             */
/* ------------------------------------------------------------------ */

async function recomputeBill(tx: TenantTransaction, tenantId: string, billId: string) {
  const bill = await tx.bill.findUniqueOrThrow({
    where: { id: billId },
    include: { lines: { include: { taxCategory: { select: { key: true } } } } },
  });

  const lineSubtotals = new Map<string, number>();
  const taxableLines: TaxableLine[] = [];
  for (const line of bill.lines) {
    const subtotal = computeBillLineSubtotal({
      quantity: Number(line.quantity.toString()),
      unitCost: Number(line.unitCost.toString()),
      discountPct: Number(line.discountPct.toString()),
      taxRate: 0,
    });
    lineSubtotals.set(line.id, subtotal);
    taxableLines.push({ id: line.id, amount: subtotal, category: (line.taxCategory?.key as TaxableLine["category"]) ?? "standard" });
  }

  const [seller, buyer] = await Promise.all([resolveSellerParty(tx, bill.partnerId), resolveBuyerParty(tx, bill.companyId)]);
  const configuredRates = await resolveConfiguredRates(tx, tenantId);
  const taxResult = computeTax({ lines: taxableLines, seller, buyer, settings: { rates: configuredRates } });
  const totalSubtotal = [...lineSubtotals.values()].reduce((a, b) => a + b, 0);

  for (const line of bill.lines) {
    const lineSubtotal = lineSubtotals.get(line.id)!;
    const share = totalSubtotal > 0 ? lineSubtotal / totalSubtotal : 0;
    const lineTax = Math.round(taxResult.totalTax * share * 100) / 100;
    await tx.billLine.update({
      where: { id: line.id },
      data: { subtotal: lineSubtotal, taxAmount: lineTax, total: Math.round((lineSubtotal + lineTax) * 100) / 100 },
    });
  }

  await tx.bill.update({
    where: { id: billId },
    data: { subtotal: totalSubtotal, taxTotal: taxResult.totalTax, total: Math.round((totalSubtotal + taxResult.totalTax) * 100) / 100 },
  });
}

async function recomputeStatus(tx: TenantTransaction, billId: string): Promise<BillStatus> {
  const bill = await tx.bill.findUniqueOrThrow({ where: { id: billId } });
  const status = deriveBillStatus(
    Number(bill.total.toString()),
    Number(bill.amountPaid.toString()),
    bill.status === "cancelled",
    bill.postedAt !== null
  );
  if (status !== bill.status) {
    await tx.bill.update({ where: { id: billId }, data: { status } });
  }
  return status;
}

/* ------------------------------------------------------------------ */
/* Queries                                                             */
/* ------------------------------------------------------------------ */

export async function listBills(ctx: RequestContext, query: RecordQuery): Promise<RecordPage<BillListItemDTO>> {
  assertPermission(ctx.permissions, "procurement:bill:read");

  const scope = recordScopeWhere(null, { userId: ctx.userId, warehouseIds: [] }, {});
  const compiled = compileQuery(query, { searchFields: SEARCH_FIELDS, allowedFields: ALLOWED_FIELDS, scope: { deletedAt: null, ...scope } });

  return withTenant(ctx.tenantId, async (tx) => {
    const [rows, total] = await Promise.all([
      tx.bill.findMany({ where: compiled.where, orderBy: compiled.orderBy, skip: compiled.skip, take: compiled.take, include: { partner: { select: { name: true } } } }),
      tx.bill.count({ where: compiled.where }),
    ]);

    return {
      rows: rows.map((r) => {
        const total = Number(r.total.toString());
        const amountPaid = Number(r.amountPaid.toString());
        return {
          id: r.id,
          number: r.number,
          status: r.status,
          partnerName: r.partner.name,
          billDate: r.billDate.toISOString(),
          dueDate: r.dueDate?.toISOString() ?? null,
          total,
          amountPaid,
          outstanding: Math.max(0, Math.round((total - amountPaid) * 100) / 100),
        };
      }),
      total,
      page: query.page,
      pageSize: compiled.take,
    };
  });
}

export async function getBill(ctx: RequestContext, id: string): Promise<BillDTO | null> {
  assertPermission(ctx.permissions, "procurement:bill:read");

  return withTenant(ctx.tenantId, async (tx) => {
    const bill = await tx.bill.findUnique({
      where: { id },
      include: {
        partner: { select: { name: true } },
        purchaseOrder: { select: { number: true } },
        lines: {
          orderBy: { sequence: "asc" },
          include: { product: { select: { sku: true, name: true } }, uom: { select: { code: true } }, taxCategory: true },
        },
      },
    });
    if (!bill) return null;

    const taxComponents = bill.taxBreakdown
      ? (bill.taxBreakdown as unknown as { label: string; rate: number; amount: number }[])
      : await computeLiveTaxComponents(tx, ctx.tenantId, bill.partnerId, bill.companyId, bill.lines);

    const total = Number(bill.total.toString());
    const amountPaid = Number(bill.amountPaid.toString());

    return {
      id: bill.id,
      number: bill.number,
      status: bill.status,
      partnerId: bill.partnerId,
      partnerName: bill.partner.name,
      currency: bill.currency,
      purchaseOrderId: bill.purchaseOrderId,
      purchaseOrderNumber: bill.purchaseOrder?.number ?? null,
      billDate: bill.billDate.toISOString(),
      dueDate: bill.dueDate?.toISOString() ?? null,
      postedAt: bill.postedAt?.toISOString() ?? null,
      subtotal: Number(bill.subtotal.toString()),
      taxTotal: Number(bill.taxTotal.toString()),
      total,
      amountPaid,
      outstanding: Math.max(0, Math.round((total - amountPaid) * 100) / 100),
      notes: bill.notes,
      taxComponents,
      lines: bill.lines.map((l) => ({
        id: l.id,
        sequence: l.sequence,
        productId: l.productId,
        productSku: l.product.sku,
        productName: l.product.name,
        description: l.description,
        uomCode: l.uom.code,
        quantity: Number(l.quantity.toString()),
        unitCost: Number(l.unitCost.toString()),
        discountPct: Number(l.discountPct.toString()),
        taxLabel: l.taxCategory?.name ?? "Standard",
        taxAmount: Number(l.taxAmount.toString()),
        subtotal: Number(l.subtotal.toString()),
        total: Number(l.total.toString()),
        purchaseOrderLineId: l.purchaseOrderLineId,
      })),
    };
  });
}

/* ------------------------------------------------------------------ */
/* Mutations                                                           */
/* ------------------------------------------------------------------ */

async function writeStandaloneLines(tx: TenantTransaction, tenantId: string, billId: string, lines: z.infer<typeof billLineInputSchema>[]) {
  await tx.billLine.deleteMany({ where: { billId } });

  let sequence = 1;
  for (const line of lines) {
    const product = await tx.product.findUniqueOrThrow({ where: { id: line.productId } });
    const unitCost = line.unitCost ?? (await resolveUnitCost(tx, line.productId));
    const subtotal = computeBillLineSubtotal({ quantity: line.quantity, unitCost, discountPct: line.discountPct, taxRate: 0 });

    await tx.billLine.create({
      data: {
        tenantId,
        billId,
        sequence: sequence++,
        purchaseOrderLineId: line.purchaseOrderLineId ?? null,
        productId: line.productId,
        description: product.name,
        uomId: product.uomId,
        quantity: line.quantity,
        unitCost,
        discountPct: line.discountPct,
        taxCategoryId: product.taxCategoryId,
        subtotal,
        total: subtotal,
      },
    });
  }
}

export async function createStandaloneBill(ctx: RequestContext, input: CreateStandaloneBillInput): Promise<string> {
  assertPermission(ctx.permissions, "procurement:bill:write");
  const data = createStandaloneBillInputSchema.parse(input);

  return withTenant(ctx.tenantId, async (tx) => {
    const [company, partner] = await Promise.all([
      tx.company.findFirstOrThrow({ where: { tenantId: ctx.tenantId }, orderBy: { createdAt: "asc" } }),
      tx.partner.findUniqueOrThrow({ where: { id: data.partnerId } }),
    ]);

    const number = await nextDocumentNumber(tx, ctx.tenantId, company.id, "bill");

    const bill = await tx.bill.create({
      data: {
        tenantId: ctx.tenantId,
        companyId: company.id,
        number,
        partnerId: data.partnerId,
        currency: partner.currency ?? company.currency,
        dueDate: data.dueDate ?? null,
        notes: data.notes ?? null,
        createdBy: ctx.userId,
        updatedBy: ctx.userId,
      },
    });

    await writeStandaloneLines(tx, ctx.tenantId, bill.id, data.lines);
    await recomputeBill(tx, ctx.tenantId, bill.id);

    await tx.auditLog.create({
      data: { tenantId: ctx.tenantId, entityType: "Bill", entityId: bill.id, action: "created", actorId: ctx.userId, actorName: ctx.userName, changes: { number: { from: null, to: number } } },
    });

    return bill.id;
  });
}

export async function createBillFromOrder(ctx: RequestContext, orderId: string, input: CreateBillFromOrderInput): Promise<string> {
  assertPermission(ctx.permissions, "procurement:bill:write");
  const data = createBillFromOrderInputSchema.parse(input);

  return withTenant(ctx.tenantId, async (tx) => {
    const order = await tx.purchaseOrder.findUniqueOrThrow({ where: { id: orderId } });
    if (order.status === "draft" || order.status === "cancelled") {
      throw new Error(`Cannot bill an order that is ${order.status}.`);
    }

    const number = await nextDocumentNumber(tx, ctx.tenantId, order.companyId, "bill");
    const bill = await tx.bill.create({
      data: {
        tenantId: ctx.tenantId,
        companyId: order.companyId,
        number,
        partnerId: order.partnerId,
        currency: order.currency,
        purchaseOrderId: order.id,
        createdBy: ctx.userId,
        updatedBy: ctx.userId,
      },
    });

    let sequence = 1;
    for (const requested of data.lines) {
      const line = await tx.purchaseOrderLine.findUniqueOrThrow({ where: { id: requested.purchaseOrderLineId } });
      const billable =
        order.billingPolicy === "bill_ordered" ? Number(line.qtyOrdered.toString()) : Number(line.qtyReceived.toString());
      const remaining = billable - Number(line.qtyBilled.toString());
      if (requested.quantity > remaining) {
        throw new Error(`Cannot bill ${requested.quantity} of "${line.description}" -- only ${remaining} remain billable.`);
      }

      await tx.billLine.create({
        data: {
          tenantId: ctx.tenantId,
          billId: bill.id,
          sequence: sequence++,
          purchaseOrderLineId: line.id,
          productId: line.productId,
          description: line.description,
          uomId: line.uomId,
          quantity: requested.quantity,
          unitCost: line.unitCost,
          discountPct: line.discountPct,
          taxCategoryId: line.taxCategoryId,
          subtotal: 0,
          total: 0,
        },
      });

      await tx.purchaseOrderLine.update({ where: { id: line.id }, data: { qtyBilled: { increment: requested.quantity } } });
    }

    await recomputeBill(tx, ctx.tenantId, bill.id);

    // isCancelled is always false here: the guard clause above already
    // rejected a cancelled order before this point ran.
    const freshLines = await tx.purchaseOrderLine.findMany({ where: { purchaseOrderId: orderId } });
    const quantities = freshLines.map((l) => ({
      qtyOrdered: Number(l.qtyOrdered.toString()),
      qtyReceived: Number(l.qtyReceived.toString()),
      qtyBilled: Number(l.qtyBilled.toString()),
    }));
    const orderStatus = deriveOrderStatus(quantities, false, true);
    if (orderStatus !== order.status) {
      await tx.purchaseOrder.update({ where: { id: orderId }, data: { status: orderStatus } });
    }

    await tx.auditLog.create({
      data: { tenantId: ctx.tenantId, entityType: "Bill", entityId: bill.id, action: "created", actorId: ctx.userId, actorName: ctx.userName, changes: { number: { from: null, to: number }, purchaseOrder: { from: null, to: order.number } } },
    });

    return bill.id;
  });
}

export async function updateBillLines(ctx: RequestContext, billId: string, input: { lines: z.infer<typeof billLineInputSchema>[] }): Promise<void> {
  assertPermission(ctx.permissions, "procurement:bill:write");
  const data = z.object({ lines: z.array(billLineInputSchema).min(1) }).parse(input);

  await withTenant(ctx.tenantId, async (tx) => {
    const bill = await tx.bill.findUniqueOrThrow({ where: { id: billId } });
    if (bill.status !== "draft") {
      throw new Error("Only a draft bill's lines can be edited. A posted bill is immutable.");
    }
    await writeStandaloneLines(tx, ctx.tenantId, billId, data.lines);
    await recomputeBill(tx, ctx.tenantId, billId);
  });
}

/**
 * The one-way transition. Once posted, a bill is immutable and emits
 * `bill.posted` for gl-subscriber.ts -- fired after the transaction
 * commits, never inside it, same reasoning as postInvoice's identical
 * comment in invoicing/invoices.ts.
 */
export async function postBill(ctx: RequestContext, billId: string): Promise<void> {
  assertPermission(ctx.permissions, "procurement:bill:post");

  const posted = await withTenant(ctx.tenantId, async (tx) => {
    const bill = await tx.bill.findUniqueOrThrow({
      where: { id: billId },
      include: { lines: { include: { taxCategory: { select: { key: true } } } } },
    });
    if (bill.status !== "draft") throw new Error(`Only a draft bill can be posted (this one is ${bill.status}).`);
    if (Number(bill.total.toString()) <= 0) throw new Error("Cannot post a bill with a zero or negative total.");

    const taxBreakdown = await computeLiveTaxComponents(tx, ctx.tenantId, bill.partnerId, bill.companyId, bill.lines);

    const now = new Date();
    await tx.bill.update({ where: { id: billId }, data: { postedAt: now, status: "posted", updatedBy: ctx.userId, taxBreakdown } });

    await tx.auditLog.create({
      data: { tenantId: ctx.tenantId, entityType: "Bill", entityId: billId, action: "posted", actorId: ctx.userId, actorName: ctx.userName },
    });

    return { billId, companyId: bill.companyId, partnerId: bill.partnerId, total: Number(bill.total.toString()), currency: bill.currency, postedAt: now.toISOString() };
  });

  emit({ type: "bill.posted", tenantId: ctx.tenantId, ...posted });
}

export async function cancelBill(ctx: RequestContext, billId: string): Promise<void> {
  assertPermission(ctx.permissions, "procurement:bill:cancel");

  await withTenant(ctx.tenantId, async (tx) => {
    const bill = await tx.bill.findUniqueOrThrow({ where: { id: billId } });
    if (bill.status !== "draft") {
      throw new Error("A posted bill cannot be cancelled -- v1 has no correction document for a posted bill. Only a draft may be discarded.");
    }

    await tx.bill.update({ where: { id: billId }, data: { status: "cancelled", updatedBy: ctx.userId } });

    const lines = await tx.billLine.findMany({ where: { billId }, select: { purchaseOrderLineId: true, quantity: true } });
    for (const line of lines) {
      if (!line.purchaseOrderLineId) continue;
      await tx.purchaseOrderLine.update({ where: { id: line.purchaseOrderLineId }, data: { qtyBilled: { decrement: line.quantity } } });
    }

    await tx.auditLog.create({
      data: { tenantId: ctx.tenantId, entityType: "Bill", entityId: billId, action: "cancelled", actorId: ctx.userId, actorName: ctx.userName },
    });
  });
}

export { recomputeStatus as recomputeBillStatus };
