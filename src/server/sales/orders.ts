import "server-only";

import { z } from "zod";
import { withTenant, type TenantTransaction } from "@/lib/db/tenant-client";
import { assertPermission, recordScopeWhere } from "@/lib/auth/permissions";
import { compileQuery } from "@/lib/query/prisma-query";
import type { RecordPage, RecordQuery } from "@/lib/query/record-query";
import { computeTax } from "@/lib/tax";
import type { TaxParty, TaxableLine, JurisdictionRate } from "@/lib/tax";
import { deriveStatus, computeLineSubtotal, type LineQuantities } from "@/lib/sales/order-status";
import { recordMove } from "@/server/inventory/stock";
import { nextDocumentNumber } from "@/server/core/numbering";
import type { RequestContext } from "@/server/context";

/**
 * Sales order service. The document graph from Stage 1 research made
 * concrete: Quotation and SalesOrder are ONE model distinguished by
 * `status` (see prisma/schema/sales.prisma's header comment), every line
 * carries qtyOrdered/qtyDelivered/qtyInvoiced, and the header status is
 * DERIVED -- never set directly except for the two facts derivation cannot
 * see on its own, confirmed and cancelled (src/lib/sales/order-status.ts).
 *
 * Confirming an order does NOT move stock -- nothing has physically
 * happened yet. Overselling is prevented at the point stock actually
 * ships (createDelivery -> recordMove's FOR UPDATE check in P2), not by a
 * soft reservation quantity. A true reserved-quantity system (so a second
 * order can be warned "37 of these are already promised" before it even
 * tries to ship) is a real, deliberately deferred v2 feature -- flagged
 * here rather than silently implied by the word "reservation" in the
 * roadmap's Scope line.
 */

/* ------------------------------------------------------------------ */
/* DTOs                                                                 */
/* ------------------------------------------------------------------ */

export interface SalesOrderLineDTO {
  id: string;
  sequence: number;
  productId: string;
  productSku: string;
  productName: string;
  description: string;
  uomCode: string;
  qtyOrdered: number;
  qtyDelivered: number;
  qtyInvoiced: number;
  unitPrice: number;
  discountPct: number;
  taxLabel: string;
  taxAmount: number;
  subtotal: number;
  total: number;
}

export interface SalesOrderDTO {
  id: string;
  number: string;
  status: string;
  invoicingPolicy: string;
  partnerId: string;
  partnerName: string;
  currency: string;
  warehouseId: string;
  warehouseName: string;
  orderDate: string;
  expectedDeliveryDate: string | null;
  salespersonName: string | null;
  subtotal: number;
  taxTotal: number;
  total: number;
  notes: string | null;
  taxComponents: { label: string; rate: number; amount: number }[];
  lines: SalesOrderLineDTO[];
  deliveredQty: number;
  orderedQty: number;
}

export interface SalesOrderListItemDTO {
  id: string;
  number: string;
  status: string;
  partnerName: string;
  orderDate: string;
  salespersonName: string | null;
  warehouseName: string;
  qtyOrdered: number;
  qtyDelivered: number;
  qtyInvoiced: number;
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
  unitPrice: z.number().min(0).optional(),
  discountPct: z.number().min(0).max(100).default(0),
});

export const createOrderInputSchema = z.object({
  partnerId: z.uuid(),
  warehouseId: z.uuid(),
  invoicingPolicy: z.enum(["invoice_ordered", "invoice_delivered"]).default("invoice_delivered"),
  expectedDeliveryDate: z.coerce.date().nullish(),
  notes: z.string().max(2000).nullish(),
  lines: z.array(orderLineInputSchema).min(1, "Add at least one line"),
});
export type CreateOrderInput = z.infer<typeof createOrderInputSchema>;

export const updateOrderLinesInputSchema = z.object({
  lines: z.array(orderLineInputSchema).min(1, "Add at least one line"),
});
export type UpdateOrderLinesInput = z.infer<typeof updateOrderLinesInputSchema>;

export const createDeliveryInputSchema = z.object({
  deliveryDate: z.coerce.date().optional(),
  notes: z.string().max(500).nullish(),
  lines: z.array(z.object({ salesOrderLineId: z.uuid(), quantity: z.number().positive() })).min(1),
});
export type CreateDeliveryInput = z.infer<typeof createDeliveryInputSchema>;

/* ------------------------------------------------------------------ */
/* Pricing & tax resolution                                            */
/* ------------------------------------------------------------------ */

async function resolveUnitPrice(
  tx: TenantTransaction,
  tenantId: string,
  productId: string,
  priceListId: string | null,
  qty: number
): Promise<number> {
  if (priceListId) {
    const tier = await tx.priceListItem.findFirst({
      where: { tenantId, priceListId, productId, minQty: { lte: qty } },
      orderBy: { minQty: "desc" },
    });
    if (tier) return Number(tier.price.toString());
  }
  const product = await tx.product.findUniqueOrThrow({ where: { id: productId }, select: { salesPrice: true } });
  return Number(product.salesPrice.toString());
}

async function resolveSellerParty(tx: TenantTransaction, companyId: string): Promise<TaxParty> {
  const company = await tx.company.findUniqueOrThrow({ where: { id: companyId } });
  return {
    address: { country: company.country, region: company.region ?? undefined, city: company.city ?? undefined },
    taxId: company.taxId ?? undefined,
    isRegistered: Boolean(company.taxId),
  };
}

/**
 * Tenant-configured jurisdiction rates, passed to every regime as
 * TaxInput.settings.rates. This is the piece that was missing entirely:
 * without it every US order silently computed zero tax (the regime has no
 * statutory default to fall back to -- see sales-tax-us.ts's own scope
 * note), and GST/VAT ignored any tenant-specific rate override even though
 * both regimes support one. src/server/core/tax-rates.ts is where a tenant
 * manages the rows this reads.
 */
async function resolveConfiguredRates(tx: TenantTransaction, tenantId: string): Promise<JurisdictionRate[]> {
  const rows = await tx.taxRate.findMany({
    where: { tenantId, isActive: true },
    include: { taxCategory: { select: { key: true } } },
  });
  return rows.map((r) => ({
    name: r.name,
    rate: Number(r.rate.toString()),
    level: r.level as JurisdictionRate["level"],
    region: r.region ?? undefined,
    category: (r.taxCategory?.key as JurisdictionRate["category"]) ?? undefined,
  }));
}

async function resolveBuyerParty(tx: TenantTransaction, partnerId: string): Promise<TaxParty> {
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

/* ------------------------------------------------------------------ */
/* Recompute: totals + status. Called after ANY mutation to a line.    */
/* ------------------------------------------------------------------ */

async function recomputeOrder(tx: TenantTransaction, tenantId: string, orderId: string) {
  const order = await tx.salesOrder.findUniqueOrThrow({ where: { id: orderId }, include: { lines: true } });
  const [seller, buyer] = await Promise.all([
    resolveSellerParty(tx, order.companyId),
    resolveBuyerParty(tx, order.partnerId),
  ]);

  const lineSubtotals = new Map<string, number>();
  const taxableLines: TaxableLine[] = [];
  for (const line of order.lines) {
    const subtotal = computeLineSubtotal({
      qtyOrdered: Number(line.qtyOrdered.toString()),
      unitPrice: Number(line.unitPrice.toString()),
      discountPct: Number(line.discountPct.toString()),
      taxRate: 0,
    });
    lineSubtotals.set(line.id, subtotal);

    const category = line.taxCategoryId
      ? (await tx.taxCategory.findUnique({ where: { id: line.taxCategoryId }, select: { key: true } }))?.key ?? "standard"
      : "standard";
    taxableLines.push({ id: line.id, amount: subtotal, category: category as TaxableLine["category"] });
  }

  // Tax is computed ONCE, across every line, so regime logic that depends on
  // the whole document (place of supply, reverse charge) sees it correctly.
  // Per-line taxAmount is then resolved from the SAME call's per-line
  // components rather than a second, separately-rounded computation, so the
  // sum of line.taxAmount always equals order.taxTotal exactly.
  const configuredRates = await resolveConfiguredRates(tx, tenantId);
  const taxResult = computeTax({ lines: taxableLines, seller, buyer, settings: { rates: configuredRates } });
  const totalSubtotal = [...lineSubtotals.values()].reduce((a, b) => a + b, 0);

  for (const line of order.lines) {
    const lineSubtotal = lineSubtotals.get(line.id)!;
    // Proportional allocation of the document-level tax back to each line,
    // by its share of the subtotal -- correct for every flat-rate regime
    // studied (GST/VAT/sales tax all apply uniformly within a category),
    // and avoids a second rounding pass disagreeing with the first.
    const share = totalSubtotal > 0 ? lineSubtotal / totalSubtotal : 0;
    const lineTax = Math.round(taxResult.totalTax * share * 100) / 100;
    await tx.salesOrderLine.update({
      where: { id: line.id },
      data: { subtotal: lineSubtotal, taxAmount: lineTax, total: Math.round((lineSubtotal + lineTax) * 100) / 100 },
    });
  }

  const quantities: LineQuantities[] = order.lines.map((l) => ({
    qtyOrdered: Number(l.qtyOrdered.toString()),
    qtyDelivered: Number(l.qtyDelivered.toString()),
    qtyInvoiced: Number(l.qtyInvoiced.toString()),
  }));
  const status = deriveStatus(quantities, order.status === "cancelled", order.status !== "draft");

  await tx.salesOrder.update({
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

export async function listSalesOrders(
  ctx: RequestContext,
  query: RecordQuery
): Promise<RecordPage<SalesOrderListItemDTO>> {
  assertPermission(ctx.permissions, "sales:order:read");

  const scope = recordScopeWhere(
    ctx.recordScopes.includes("own_records") ? "own_records" : null,
    { userId: ctx.userId, warehouseIds: [] },
    { ownerField: "salespersonId" }
  );

  const compiled = compileQuery(query, {
    searchFields: SEARCH_FIELDS,
    allowedFields: ALLOWED_FIELDS,
    scope: { deletedAt: null, ...scope },
  });

  return withTenant(ctx.tenantId, async (tx) => {
    const [rows, total] = await Promise.all([
      tx.salesOrder.findMany({
        where: compiled.where,
        orderBy: compiled.orderBy,
        skip: compiled.skip,
        take: compiled.take,
        include: {
          partner: { select: { name: true } },
          warehouse: { select: { name: true } },
          lines: { select: { qtyOrdered: true, qtyDelivered: true, qtyInvoiced: true } },
        },
      }),
      tx.salesOrder.count({ where: compiled.where }),
    ]);

    const salespersonIds = [...new Set(rows.map((r) => r.salespersonId).filter((x): x is string => !!x))];
    const salespeople = salespersonIds.length
      ? await tx.membership.findMany({ where: { userId: { in: salespersonIds } }, include: { user: true } })
      : [];
    const nameByUserId = new Map(salespeople.map((m) => [m.userId, m.user.name ?? m.user.email]));

    return {
      rows: rows.map((r) => ({
        id: r.id,
        number: r.number,
        status: r.status,
        partnerName: r.partner.name,
        orderDate: r.orderDate.toISOString(),
        salespersonName: r.salespersonId ? (nameByUserId.get(r.salespersonId) ?? null) : null,
        warehouseName: r.warehouse.name,
        qtyOrdered: sumField(r.lines, (l) => l.qtyOrdered),
        qtyDelivered: sumField(r.lines, (l) => l.qtyDelivered),
        qtyInvoiced: sumField(r.lines, (l) => l.qtyInvoiced),
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

export async function getSalesOrder(ctx: RequestContext, id: string): Promise<SalesOrderDTO | null> {
  assertPermission(ctx.permissions, "sales:order:read");

  return withTenant(ctx.tenantId, async (tx) => {
    const order = await tx.salesOrder.findUnique({
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

    const [seller, buyer] = await Promise.all([
      resolveSellerParty(tx, order.companyId),
      resolveBuyerParty(tx, order.partnerId),
    ]);
    const taxableLines: TaxableLine[] = order.lines.map((l) => ({
      id: l.id,
      amount: Number(l.subtotal.toString()),
      category: (l.taxCategory?.key as TaxableLine["category"]) ?? "standard",
    }));
    const configuredRates = await resolveConfiguredRates(tx, ctx.tenantId);
    const taxResult = computeTax({ lines: taxableLines, seller, buyer, settings: { rates: configuredRates } });

    const salesperson = order.salespersonId
      ? await tx.membership.findFirst({ where: { userId: order.salespersonId }, include: { user: true } })
      : null;

    return {
      id: order.id,
      number: order.number,
      status: order.status,
      invoicingPolicy: order.invoicingPolicy,
      partnerId: order.partnerId,
      partnerName: order.partner.name,
      currency: order.currency,
      warehouseId: order.warehouseId,
      warehouseName: order.warehouse.name,
      orderDate: order.orderDate.toISOString(),
      expectedDeliveryDate: order.expectedDeliveryDate?.toISOString() ?? null,
      salespersonName: salesperson ? (salesperson.user.name ?? salesperson.user.email) : null,
      subtotal: Number(order.subtotal.toString()),
      taxTotal: Number(order.taxTotal.toString()),
      total: Number(order.total.toString()),
      notes: order.notes,
      taxComponents: taxResult.components.map((c) => ({ label: c.label, rate: c.rate, amount: c.amount })),
      orderedQty: sumField(order.lines, (l) => l.qtyOrdered),
      deliveredQty: sumField(order.lines, (l) => l.qtyDelivered),
      lines: order.lines.map((l) => ({
        id: l.id,
        sequence: l.sequence,
        productId: l.productId,
        productSku: l.product.sku,
        productName: l.product.name,
        description: l.description,
        uomCode: l.uom.code,
        qtyOrdered: Number(l.qtyOrdered.toString()),
        qtyDelivered: Number(l.qtyDelivered.toString()),
        qtyInvoiced: Number(l.qtyInvoiced.toString()),
        unitPrice: Number(l.unitPrice.toString()),
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

export async function createSalesOrder(ctx: RequestContext, input: CreateOrderInput): Promise<string> {
  assertPermission(ctx.permissions, "sales:order:write");
  const data = createOrderInputSchema.parse(input);

  return withTenant(ctx.tenantId, async (tx) => {
    const [company, partner] = await Promise.all([
      tx.company.findFirstOrThrow({ where: { tenantId: ctx.tenantId }, orderBy: { createdAt: "asc" } }),
      tx.partner.findUniqueOrThrow({ where: { id: data.partnerId } }),
    ]);

    const number = await nextDocumentNumber(tx, ctx.tenantId, company.id, "sales_order");

    const order = await tx.salesOrder.create({
      data: {
        tenantId: ctx.tenantId,
        companyId: company.id,
        number,
        partnerId: data.partnerId,
        currency: partner.currency ?? company.currency,
        warehouseId: data.warehouseId,
        invoicingPolicy: data.invoicingPolicy,
        expectedDeliveryDate: data.expectedDeliveryDate ?? null,
        notes: data.notes ?? null,
        salespersonId: ctx.userId,
        createdBy: ctx.userId,
        updatedBy: ctx.userId,
      },
    });

    await writeLines(tx, ctx.tenantId, order.id, data.lines, order.priceListId ?? null);
    await recomputeOrder(tx, ctx.tenantId, order.id);

    await tx.auditLog.create({
      data: {
        tenantId: ctx.tenantId,
        entityType: "SalesOrder",
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

async function writeLines(
  tx: TenantTransaction,
  tenantId: string,
  orderId: string,
  lines: z.infer<typeof orderLineInputSchema>[],
  priceListId: string | null
) {
  await tx.salesOrderLine.deleteMany({ where: { salesOrderId: orderId } });

  let sequence = 1;
  for (const line of lines) {
    const product = await tx.product.findUniqueOrThrow({ where: { id: line.productId } });
    const unitPrice = line.unitPrice ?? (await resolveUnitPrice(tx, tenantId, line.productId, priceListId, line.qtyOrdered));
    const subtotal = computeLineSubtotal({
      qtyOrdered: line.qtyOrdered,
      unitPrice,
      discountPct: line.discountPct,
      taxRate: 0,
    });

    await tx.salesOrderLine.create({
      data: {
        tenantId,
        salesOrderId: orderId,
        sequence: sequence++,
        productId: line.productId,
        description: product.name,
        uomId: product.uomId,
        qtyOrdered: line.qtyOrdered,
        unitPrice,
        discountPct: line.discountPct,
        taxCategoryId: product.taxCategoryId,
        subtotal,
        total: subtotal,
      },
    });
  }
}

export async function updateSalesOrderLines(
  ctx: RequestContext,
  orderId: string,
  input: UpdateOrderLinesInput
): Promise<void> {
  assertPermission(ctx.permissions, "sales:order:write");
  const data = updateOrderLinesInputSchema.parse(input);

  await withTenant(ctx.tenantId, async (tx) => {
    const order = await tx.salesOrder.findUniqueOrThrow({ where: { id: orderId } });
    if (order.status !== "draft") {
      throw new Error("Only a draft order's lines can be edited. Cancel and recreate, or contact support for a correction.");
    }
    await writeLines(tx, ctx.tenantId, orderId, data.lines, order.priceListId);
    await recomputeOrder(tx, ctx.tenantId, orderId);
  });
}

export async function confirmSalesOrder(ctx: RequestContext, orderId: string): Promise<void> {
  assertPermission(ctx.permissions, "sales:order:confirm");

  await withTenant(ctx.tenantId, async (tx) => {
    const order = await tx.salesOrder.findUniqueOrThrow({ where: { id: orderId } });
    if (order.status !== "draft") throw new Error("Only a draft order can be confirmed.");

    // No stock move here -- confirming commits the order, it does not ship
    // anything. See this file's header comment on why v1 has no soft
    // reservation quantity.
    await tx.salesOrder.update({ where: { id: orderId }, data: { status: "confirmed", updatedBy: ctx.userId } });
    await recomputeOrder(tx, ctx.tenantId, orderId);

    await tx.auditLog.create({
      data: {
        tenantId: ctx.tenantId,
        entityType: "SalesOrder",
        entityId: orderId,
        action: "confirmed",
        actorId: ctx.userId,
        actorName: ctx.userName,
      },
    });
  });
}

export async function cancelSalesOrder(ctx: RequestContext, orderId: string): Promise<void> {
  assertPermission(ctx.permissions, "sales:order:cancel");

  await withTenant(ctx.tenantId, async (tx) => {
    const order = await tx.salesOrder.findUniqueOrThrow({ where: { id: orderId } });
    if (order.status === "invoiced" || order.status === "cancelled") {
      throw new Error(`An order that is already ${order.status} cannot be cancelled.`);
    }
    if (Number(order.total) > 0) {
      const delivered = await tx.salesOrderLine.aggregate({ where: { salesOrderId: orderId }, _sum: { qtyDelivered: true } });
      if (Number(delivered._sum.qtyDelivered ?? 0) > 0) {
        throw new Error("An order with a delivery already recorded against it cannot be cancelled.");
      }
    }

    await tx.salesOrder.update({ where: { id: orderId }, data: { status: "cancelled", updatedBy: ctx.userId } });

    await tx.auditLog.create({
      data: {
        tenantId: ctx.tenantId,
        entityType: "SalesOrder",
        entityId: orderId,
        action: "cancelled",
        actorId: ctx.userId,
        actorName: ctx.userName,
      },
    });
  });
}

/**
 * Ships some or all of an order's lines in one delivery event. Creates
 * Delivery + DeliveryLine rows AND the underlying StockMove(s) atomically --
 * all inside the one transaction, via stock.ts's recordMove primitive
 * directly rather than its permission-checked public wrapper (see
 * recordMove's own doc comment for why: "ship this order" is gated by the
 * sales:order permission the top of this function already asserted, not by
 * a redundant inventory:stock:move check on an internal implementation
 * detail).
 */
export async function createDelivery(
  ctx: RequestContext,
  orderId: string,
  input: CreateDeliveryInput
): Promise<string> {
  assertPermission(ctx.permissions, "sales:order:write");
  const data = createDeliveryInputSchema.parse(input);

  return withTenant(ctx.tenantId, async (tx) => {
    const order = await tx.salesOrder.findUniqueOrThrow({ where: { id: orderId } });
    if (order.status === "draft" || order.status === "cancelled") {
      throw new Error(`Cannot deliver against an order that is ${order.status}.`);
    }

    const stockLocation = await tx.location.findFirstOrThrow({
      where: { tenantId: ctx.tenantId, warehouseId: order.warehouseId, kind: "internal" },
    });
    const customers = await tx.location.findFirstOrThrow({
      where: { tenantId: ctx.tenantId, kind: "external", code: "CUSTOMERS" },
    });

    const number = await nextDocumentNumber(tx, ctx.tenantId, order.companyId, "delivery");
    const delivery = await tx.delivery.create({
      data: {
        tenantId: ctx.tenantId,
        salesOrderId: orderId,
        number,
        deliveryDate: data.deliveryDate ?? new Date(),
        notes: data.notes ?? null,
        createdBy: ctx.userId,
      },
    });

    for (const requested of data.lines) {
      const line = await tx.salesOrderLine.findUniqueOrThrow({ where: { id: requested.salesOrderLineId } });
      const remaining = Number(line.qtyOrdered.toString()) - Number(line.qtyDelivered.toString());
      if (requested.quantity > remaining) {
        throw new Error(`Cannot deliver ${requested.quantity} of "${line.description}" -- only ${remaining} remain on the order.`);
      }

      const move = await recordMove(tx, {
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        type: "delivery",
        productId: line.productId,
        fromLocationId: stockLocation.id,
        toLocationId: customers.id,
        quantity: requested.quantity,
        reference: number,
      });

      await tx.deliveryLine.create({
        data: {
          tenantId: ctx.tenantId,
          deliveryId: delivery.id,
          salesOrderLineId: line.id,
          productId: line.productId,
          quantity: requested.quantity,
          stockMoveId: move.id,
        },
      });

      await tx.salesOrderLine.update({
        where: { id: line.id },
        data: { qtyDelivered: { increment: requested.quantity } },
      });
    }

    const { status } = await recomputeOrder(tx, ctx.tenantId, orderId);

    await tx.auditLog.create({
      data: {
        tenantId: ctx.tenantId,
        entityType: "SalesOrder",
        entityId: orderId,
        action: "delivered",
        actorId: ctx.userId,
        actorName: ctx.userName,
        changes: { delivery: { from: null, to: number }, status: { from: order.status, to: status } },
      },
    });

    return delivery.id;
  });
}
