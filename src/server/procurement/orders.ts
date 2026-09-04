import "server-only";

import { z } from "zod";
import { withTenant, type TenantTransaction } from "@/lib/db/tenant-client";
import { assertPermission, recordScopeWhere } from "@/lib/auth/permissions";
import { compileQuery } from "@/lib/query/prisma-query";
import type { RecordPage, RecordQuery } from "@/lib/query/record-query";
import { deriveStatus, computeLineSubtotal, type LineQuantities } from "@/lib/procurement/order-status";
import { computeTax } from "@/lib/tax";
import type { TaxParty, TaxableLine, JurisdictionRate } from "@/lib/tax";
import { recordMove } from "@/server/inventory/stock";
import { nextDocumentNumber } from "@/server/core/numbering";
import type { RequestContext } from "@/server/context";

/**
 * Purchase order service — the buy-side mirror of src/server/sales/orders.ts.
 * Every structural decision restates that file's own: header status is
 * DERIVED from line quantities (src/lib/procurement/order-status.ts),
 * confirming does NOT move stock (nothing has physically happened yet --
 * overselling^H^H^Hoverbuying is not the risk here the way overselling is
 * on the sales side, but the discipline of "confirm commits, receipt
 * moves stock" stays identical for the same reason: one state transition,
 * one meaning), and createReceipt calls recordMove() directly (not
 * receiveStock()'s permission-checked wrapper) for the identical reason
 * sales/orders.ts's createDelivery does -- "receive against this PO" is
 * already gated by the permission this file's own function asserts.
 */

/* ------------------------------------------------------------------ */
/* DTOs                                                                 */
/* ------------------------------------------------------------------ */

export interface PurchaseOrderLineDTO {
  id: string;
  sequence: number;
  productId: string;
  productSku: string;
  productName: string;
  description: string;
  uomCode: string;
  qtyOrdered: number;
  qtyReceived: number;
  qtyBilled: number;
  unitCost: number;
  discountPct: number;
  taxLabel: string;
  taxAmount: number;
  subtotal: number;
  total: number;
}

export interface PurchaseOrderDTO {
  id: string;
  number: string;
  status: string;
  billingPolicy: string;
  partnerId: string;
  partnerName: string;
  currency: string;
  warehouseId: string;
  warehouseName: string;
  orderDate: string;
  expectedReceiptDate: string | null;
  buyerName: string | null;
  subtotal: number;
  taxTotal: number;
  total: number;
  notes: string | null;
  taxComponents: { label: string; rate: number; amount: number }[];
  lines: PurchaseOrderLineDTO[];
  receivedQty: number;
  orderedQty: number;
}

export interface PurchaseOrderListItemDTO {
  id: string;
  number: string;
  status: string;
  partnerName: string;
  orderDate: string;
  warehouseName: string;
  qtyOrdered: number;
  qtyReceived: number;
  qtyBilled: number;
  total: number;
}

const SEARCH_FIELDS = ["number", "partner.name"];
const ALLOWED_FIELDS = ["number", "status", "orderDate", "total", "partner.name"];

/* ------------------------------------------------------------------ */
/* Input contracts                                                     */
/* ------------------------------------------------------------------ */

const orderLineInputSchema = z.object({
  productId: z.uuid(),
  qtyOrdered: z.number().positive(),
  unitCost: z.number().min(0).optional(),
  discountPct: z.number().min(0).max(100).default(0),
});

export const createOrderInputSchema = z.object({
  partnerId: z.uuid(),
  warehouseId: z.uuid(),
  billingPolicy: z.enum(["bill_ordered", "bill_received"]).default("bill_received"),
  expectedReceiptDate: z.coerce.date().nullish(),
  notes: z.string().max(2000).nullish(),
  lines: z.array(orderLineInputSchema).min(1, "Add at least one line"),
});
export type CreateOrderInput = z.infer<typeof createOrderInputSchema>;

export const updateOrderLinesInputSchema = z.object({
  lines: z.array(orderLineInputSchema).min(1, "Add at least one line"),
});
export type UpdateOrderLinesInput = z.infer<typeof updateOrderLinesInputSchema>;

export const createReceiptInputSchema = z.object({
  receiptDate: z.coerce.date().optional(),
  notes: z.string().max(500).nullish(),
  lines: z.array(z.object({ purchaseOrderLineId: z.uuid(), quantity: z.number().positive() })).min(1),
});
export type CreateReceiptInput = z.infer<typeof createReceiptInputSchema>;

/* ------------------------------------------------------------------ */
/* Pricing & tax resolution                                            */
/* ------------------------------------------------------------------ */

async function resolveUnitCost(tx: TenantTransaction, productId: string): Promise<number> {
  const product = await tx.product.findUniqueOrThrow({ where: { id: productId }, select: { costPrice: true } });
  return Number(product.costPrice.toString());
}

/**
 * For a purchase order, the SUPPLIER is the seller of record for tax
 * purposes (they charge us tax) -- the reverse of sales/orders.ts's own
 * resolveSellerParty/resolveBuyerParty, which is why the party each
 * resolves to is swapped here rather than reusing that file's functions.
 */
async function resolveSupplierParty(tx: TenantTransaction, partnerId: string): Promise<TaxParty> {
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

async function resolveOurCompanyParty(tx: TenantTransaction, companyId: string): Promise<TaxParty> {
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

/* ------------------------------------------------------------------ */
/* Recompute: totals + status. Called after ANY mutation to a line.    */
/* ------------------------------------------------------------------ */

async function recomputeOrder(tx: TenantTransaction, tenantId: string, orderId: string) {
  const order = await tx.purchaseOrder.findUniqueOrThrow({
    where: { id: orderId },
    include: { lines: { include: { taxCategory: { select: { key: true } } } } },
  });
  const [supplier, us] = await Promise.all([
    resolveSupplierParty(tx, order.partnerId),
    resolveOurCompanyParty(tx, order.companyId),
  ]);

  const lineSubtotals = new Map<string, number>();
  const taxableLines: TaxableLine[] = [];
  for (const line of order.lines) {
    const subtotal = computeLineSubtotal({
      qtyOrdered: Number(line.qtyOrdered.toString()),
      unitCost: Number(line.unitCost.toString()),
      discountPct: Number(line.discountPct.toString()),
      taxRate: 0,
    });
    lineSubtotals.set(line.id, subtotal);
    const category = (line.taxCategory?.key ?? "standard") as TaxableLine["category"];
    taxableLines.push({ id: line.id, amount: subtotal, category });
  }

  const configuredRates = await resolveConfiguredRates(tx, tenantId);
  // seller = supplier (they charge the tax), buyer = us.
  const taxResult = computeTax({ lines: taxableLines, seller: supplier, buyer: us, settings: { rates: configuredRates } });
  const totalSubtotal = [...lineSubtotals.values()].reduce((a, b) => a + b, 0);

  for (const line of order.lines) {
    const lineSubtotal = lineSubtotals.get(line.id)!;
    const share = totalSubtotal > 0 ? lineSubtotal / totalSubtotal : 0;
    const lineTax = Math.round(taxResult.totalTax * share * 100) / 100;
    await tx.purchaseOrderLine.update({
      where: { id: line.id },
      data: { subtotal: lineSubtotal, taxAmount: lineTax, total: Math.round((lineSubtotal + lineTax) * 100) / 100 },
    });
  }

  const quantities: LineQuantities[] = order.lines.map((l) => ({
    qtyOrdered: Number(l.qtyOrdered.toString()),
    qtyReceived: Number(l.qtyReceived.toString()),
    qtyBilled: Number(l.qtyBilled.toString()),
  }));
  const status = deriveStatus(quantities, order.status === "cancelled", order.status !== "draft");

  await tx.purchaseOrder.update({
    where: { id: orderId },
    data: {
      subtotal: totalSubtotal,
      taxTotal: taxResult.totalTax,
      total: Math.round((totalSubtotal + taxResult.totalTax) * 100) / 100,
      status,
    },
  });

  return { status, taxComponents: taxResult.components };
}

/* ------------------------------------------------------------------ */
/* Queries                                                             */
/* ------------------------------------------------------------------ */

export async function listPurchaseOrders(ctx: RequestContext, query: RecordQuery): Promise<RecordPage<PurchaseOrderListItemDTO>> {
  assertPermission(ctx.permissions, "procurement:order:read");

  const scope = recordScopeWhere(
    ctx.recordScopes.includes("own_warehouse") ? "own_warehouse" : null,
    { userId: ctx.userId, warehouseIds: [] },
    { warehouseField: "warehouseId" }
  );

  const compiled = compileQuery(query, { searchFields: SEARCH_FIELDS, allowedFields: ALLOWED_FIELDS, scope: { deletedAt: null, ...scope } });

  return withTenant(ctx.tenantId, async (tx) => {
    const [rows, total] = await Promise.all([
      tx.purchaseOrder.findMany({
        where: compiled.where,
        orderBy: compiled.orderBy,
        skip: compiled.skip,
        take: compiled.take,
        include: {
          partner: { select: { name: true } },
          warehouse: { select: { name: true } },
          lines: { select: { qtyOrdered: true, qtyReceived: true, qtyBilled: true } },
        },
      }),
      tx.purchaseOrder.count({ where: compiled.where }),
    ]);

    return {
      rows: rows.map((r) => ({
        id: r.id,
        number: r.number,
        status: r.status,
        partnerName: r.partner.name,
        orderDate: r.orderDate.toISOString(),
        warehouseName: r.warehouse.name,
        qtyOrdered: sumField(r.lines, (l) => l.qtyOrdered),
        qtyReceived: sumField(r.lines, (l) => l.qtyReceived),
        qtyBilled: sumField(r.lines, (l) => l.qtyBilled),
        total: Number(r.total.toString()),
      })),
      total,
      page: query.page,
      pageSize: compiled.take,
    };
  });
}

function sumField<T>(lines: T[], pick: (line: T) => { toString(): string }): number {
  return lines.reduce((sum, l) => sum + Number(pick(l).toString()), 0);
}

export async function getPurchaseOrder(ctx: RequestContext, id: string): Promise<PurchaseOrderDTO | null> {
  assertPermission(ctx.permissions, "procurement:order:read");

  return withTenant(ctx.tenantId, async (tx) => {
    const order = await tx.purchaseOrder.findUnique({
      where: { id },
      include: {
        partner: { select: { name: true } },
        warehouse: { select: { name: true } },
        lines: {
          orderBy: { sequence: "asc" },
          include: { product: { select: { sku: true, name: true } }, uom: { select: { code: true } }, taxCategory: true },
        },
      },
    });
    if (!order) return null;

    const [supplier, us] = await Promise.all([resolveSupplierParty(tx, order.partnerId), resolveOurCompanyParty(tx, order.companyId)]);
    const taxableLines: TaxableLine[] = order.lines.map((l) => ({
      id: l.id,
      amount: Number(l.subtotal.toString()),
      category: (l.taxCategory?.key as TaxableLine["category"]) ?? "standard",
    }));
    const configuredRates = await resolveConfiguredRates(tx, ctx.tenantId);
    const taxResult = computeTax({ lines: taxableLines, seller: supplier, buyer: us, settings: { rates: configuredRates } });

    const buyer = order.buyerId
      ? await tx.membership.findFirst({ where: { userId: order.buyerId }, include: { user: true } })
      : null;

    return {
      id: order.id,
      number: order.number,
      status: order.status,
      billingPolicy: order.billingPolicy,
      partnerId: order.partnerId,
      partnerName: order.partner.name,
      currency: order.currency,
      warehouseId: order.warehouseId,
      warehouseName: order.warehouse.name,
      orderDate: order.orderDate.toISOString(),
      expectedReceiptDate: order.expectedReceiptDate?.toISOString() ?? null,
      buyerName: buyer ? (buyer.user.name ?? buyer.user.email) : null,
      subtotal: Number(order.subtotal.toString()),
      taxTotal: Number(order.taxTotal.toString()),
      total: Number(order.total.toString()),
      notes: order.notes,
      taxComponents: taxResult.components.map((c) => ({ label: c.label, rate: c.rate, amount: c.amount })),
      orderedQty: sumField(order.lines, (l) => l.qtyOrdered),
      receivedQty: sumField(order.lines, (l) => l.qtyReceived),
      lines: order.lines.map((l) => ({
        id: l.id,
        sequence: l.sequence,
        productId: l.productId,
        productSku: l.product.sku,
        productName: l.product.name,
        description: l.description,
        uomCode: l.uom.code,
        qtyOrdered: Number(l.qtyOrdered.toString()),
        qtyReceived: Number(l.qtyReceived.toString()),
        qtyBilled: Number(l.qtyBilled.toString()),
        unitCost: Number(l.unitCost.toString()),
        discountPct: Number(l.discountPct.toString()),
        taxLabel: l.taxCategory?.name ?? "Standard",
        taxAmount: Number(l.taxAmount.toString()),
        subtotal: Number(l.subtotal.toString()),
        total: Number(l.total.toString()),
      })),
    };
  });
}

/* ------------------------------------------------------------------ */
/* Mutations                                                           */
/* ------------------------------------------------------------------ */

export async function createPurchaseOrder(ctx: RequestContext, input: CreateOrderInput): Promise<string> {
  assertPermission(ctx.permissions, "procurement:order:write");
  const data = createOrderInputSchema.parse(input);

  return withTenant(ctx.tenantId, async (tx) => {
    const [company, partner] = await Promise.all([
      tx.company.findFirstOrThrow({ where: { tenantId: ctx.tenantId }, orderBy: { createdAt: "asc" } }),
      tx.partner.findUniqueOrThrow({ where: { id: data.partnerId } }),
    ]);

    const number = await nextDocumentNumber(tx, ctx.tenantId, company.id, "purchase_order");

    const order = await tx.purchaseOrder.create({
      data: {
        tenantId: ctx.tenantId,
        companyId: company.id,
        number,
        partnerId: data.partnerId,
        currency: partner.currency ?? company.currency,
        warehouseId: data.warehouseId,
        billingPolicy: data.billingPolicy,
        expectedReceiptDate: data.expectedReceiptDate ?? null,
        notes: data.notes ?? null,
        buyerId: ctx.userId,
        createdBy: ctx.userId,
        updatedBy: ctx.userId,
      },
    });

    await writeLines(tx, ctx.tenantId, order.id, data.lines);
    await recomputeOrder(tx, ctx.tenantId, order.id);

    await tx.auditLog.create({
      data: {
        tenantId: ctx.tenantId,
        entityType: "PurchaseOrder",
        entityId: order.id,
        action: "created",
        actorId: ctx.userId,
        actorName: ctx.userName,
        changes: { number: { from: null, to: number } },
      },
    });

    return order.id;
  });
}

async function writeLines(tx: TenantTransaction, tenantId: string, orderId: string, lines: z.infer<typeof orderLineInputSchema>[]) {
  await tx.purchaseOrderLine.deleteMany({ where: { purchaseOrderId: orderId } });

  let sequence = 1;
  for (const line of lines) {
    const product = await tx.product.findUniqueOrThrow({ where: { id: line.productId } });
    const unitCost = line.unitCost ?? (await resolveUnitCost(tx, line.productId));
    const subtotal = computeLineSubtotal({ qtyOrdered: line.qtyOrdered, unitCost, discountPct: line.discountPct, taxRate: 0 });

    await tx.purchaseOrderLine.create({
      data: {
        tenantId,
        purchaseOrderId: orderId,
        sequence: sequence++,
        productId: line.productId,
        description: product.name,
        uomId: product.uomId,
        qtyOrdered: line.qtyOrdered,
        unitCost,
        discountPct: line.discountPct,
        taxCategoryId: product.taxCategoryId,
        subtotal,
        total: subtotal,
      },
    });
  }
}

export async function updatePurchaseOrderLines(ctx: RequestContext, orderId: string, input: UpdateOrderLinesInput): Promise<void> {
  assertPermission(ctx.permissions, "procurement:order:write");
  const data = updateOrderLinesInputSchema.parse(input);

  await withTenant(ctx.tenantId, async (tx) => {
    const order = await tx.purchaseOrder.findUniqueOrThrow({ where: { id: orderId } });
    if (order.status !== "draft") {
      throw new Error("Only a draft order's lines can be edited. Cancel and recreate, or contact support for a correction.");
    }
    await writeLines(tx, ctx.tenantId, orderId, data.lines);
    await recomputeOrder(tx, ctx.tenantId, orderId);
  });
}

export async function confirmPurchaseOrder(ctx: RequestContext, orderId: string): Promise<void> {
  assertPermission(ctx.permissions, "procurement:order:confirm");

  await withTenant(ctx.tenantId, async (tx) => {
    const order = await tx.purchaseOrder.findUniqueOrThrow({ where: { id: orderId } });
    if (order.status !== "draft") throw new Error("Only a draft order can be confirmed.");

    await tx.purchaseOrder.update({ where: { id: orderId }, data: { status: "confirmed", updatedBy: ctx.userId } });
    await recomputeOrder(tx, ctx.tenantId, orderId);

    await tx.auditLog.create({
      data: { tenantId: ctx.tenantId, entityType: "PurchaseOrder", entityId: orderId, action: "confirmed", actorId: ctx.userId, actorName: ctx.userName },
    });
  });
}

export async function cancelPurchaseOrder(ctx: RequestContext, orderId: string): Promise<void> {
  assertPermission(ctx.permissions, "procurement:order:cancel");

  await withTenant(ctx.tenantId, async (tx) => {
    const order = await tx.purchaseOrder.findUniqueOrThrow({ where: { id: orderId } });
    if (order.status === "billed" || order.status === "cancelled") {
      throw new Error(`An order that is already ${order.status} cannot be cancelled.`);
    }
    if (Number(order.total) > 0) {
      const received = await tx.purchaseOrderLine.aggregate({ where: { purchaseOrderId: orderId }, _sum: { qtyReceived: true } });
      if (Number(received._sum.qtyReceived ?? 0) > 0) {
        throw new Error("An order with a receipt already recorded against it cannot be cancelled.");
      }
    }

    await tx.purchaseOrder.update({ where: { id: orderId }, data: { status: "cancelled", updatedBy: ctx.userId } });
    await tx.auditLog.create({
      data: { tenantId: ctx.tenantId, entityType: "PurchaseOrder", entityId: orderId, action: "cancelled", actorId: ctx.userId, actorName: ctx.userName },
    });
  });
}

/**
 * Receives some or all of an order's lines in one receipt event. Creates
 * Receipt + ReceiptLine rows AND the underlying StockMove(s) atomically,
 * calling stock.ts's recordMove primitive directly -- see this file's own
 * header comment for why.
 */
export async function createReceipt(ctx: RequestContext, orderId: string, input: CreateReceiptInput): Promise<string> {
  assertPermission(ctx.permissions, "procurement:receipt:write");
  const data = createReceiptInputSchema.parse(input);

  return withTenant(ctx.tenantId, async (tx) => {
    const order = await tx.purchaseOrder.findUniqueOrThrow({ where: { id: orderId } });
    if (order.status === "draft" || order.status === "cancelled") {
      throw new Error(`Cannot receive against an order that is ${order.status}.`);
    }

    const stockLocation = await tx.location.findFirstOrThrow({
      where: { tenantId: ctx.tenantId, warehouseId: order.warehouseId, kind: "internal" },
    });
    const suppliers = await tx.location.findFirstOrThrow({
      where: { tenantId: ctx.tenantId, kind: "external", code: "SUPPLIERS" },
    });

    const number = await nextDocumentNumber(tx, ctx.tenantId, order.companyId, "receipt");
    const receipt = await tx.receipt.create({
      data: {
        tenantId: ctx.tenantId,
        purchaseOrderId: orderId,
        number,
        receiptDate: data.receiptDate ?? new Date(),
        notes: data.notes ?? null,
        createdBy: ctx.userId,
      },
    });

    for (const requested of data.lines) {
      const line = await tx.purchaseOrderLine.findUniqueOrThrow({ where: { id: requested.purchaseOrderLineId } });
      const remaining = Number(line.qtyOrdered.toString()) - Number(line.qtyReceived.toString());
      if (requested.quantity > remaining) {
        throw new Error(`Cannot receive ${requested.quantity} of "${line.description}" -- only ${remaining} remain on the order.`);
      }

      const move = await recordMove(tx, {
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        type: "receipt",
        productId: line.productId,
        fromLocationId: suppliers.id,
        toLocationId: stockLocation.id,
        quantity: requested.quantity,
        unitCost: Number(line.unitCost.toString()),
        reference: number,
      });

      await tx.receiptLine.create({
        data: {
          tenantId: ctx.tenantId,
          receiptId: receipt.id,
          purchaseOrderLineId: line.id,
          productId: line.productId,
          quantity: requested.quantity,
          stockMoveId: move.id,
        },
      });

      await tx.purchaseOrderLine.update({ where: { id: line.id }, data: { qtyReceived: { increment: requested.quantity } } });
    }

    const { status } = await recomputeOrder(tx, ctx.tenantId, orderId);

    await tx.auditLog.create({
      data: {
        tenantId: ctx.tenantId,
        entityType: "PurchaseOrder",
        entityId: orderId,
        action: "received",
        actorId: ctx.userId,
        actorName: ctx.userName,
        changes: { receipt: { from: null, to: number }, status: { from: order.status, to: status } },
      },
    });

    return receipt.id;
  });
}
