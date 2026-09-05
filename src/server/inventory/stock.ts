import "server-only";

import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { withTenant, type TenantTransaction } from "@/lib/db/tenant-client";
import { assertPermission, canSeeCost } from "@/lib/auth/permissions";
import { applyValuationEvent, ZERO_BALANCE } from "@/lib/inventory/avco";
import { emit, type StockValuedEvent } from "@/server/core/events";
import type { RequestContext } from "@/server/context";

/**
 * Stock service — the two non-negotiable rules from docs/architecture.md
 * §5.6, made concrete:
 *
 *   1. StockQuant is never written directly. Every write to it happens
 *      through recordMove(), inside the same transaction as the StockMove
 *      row that justifies it, using Prisma's atomic increment/decrement
 *      (a single UPDATE statement Postgres serialises at the row level --
 *      safe under concurrent moves without hand-rolled locking).
 *   2. A correction is a new, opposite move. Nothing here ever UPDATEs or
 *      DELETEs an existing StockMove.
 *
 * Four public operations (receive/deliver/transfer/adjust) are thin callers
 * of one private primitive, recordMove, which is where both rules actually
 * live -- exactly the shape that makes them hard to violate by accident.
 */

export type MoveKind = "receipt" | "delivery" | "transfer" | "adjustment" | "consumption" | "production";

export interface StockMoveDTO {
  id: string;
  type: MoveKind;
  productName: string;
  productSku: string;
  fromLocationCode: string;
  toLocationCode: string;
  quantity: number;
  /// Layer 4: null for a role without canSeeCost (e.g. Warehouse — see
  /// lib/auth/permissions.ts's canSeeCost doc comment).
  unitCost: number | null;
  reference: string | null;
  movedAt: string;
}

export interface StockLevelDTO {
  productId: string;
  sku: string;
  name: string;
  uomCode: string;
  onHand: number;
  /// Layer 4: null for a role without canSeeCost.
  averageCost: number | null;
  value: number | null;
  reorderPoint: number | null;
  isLow: boolean;
}

/* ------------------------------------------------------------------ */
/* Input contracts                                                     */
/* ------------------------------------------------------------------ */

const baseMoveSchema = z.object({
  productId: z.uuid(),
  quantity: z.number().positive("Quantity must be greater than zero"),
  reference: z.string().max(200).nullish(),
  movedAt: z.coerce.date().optional(),
  lotCode: z.string().max(100).nullish(),
});

export const receiveStockSchema = baseMoveSchema.extend({
  toLocationId: z.uuid(),
  unitCost: z.number().min(0),
});
export const deliverStockSchema = baseMoveSchema.extend({
  fromLocationId: z.uuid(),
});
export const transferStockSchema = baseMoveSchema.extend({
  fromLocationId: z.uuid(),
  toLocationId: z.uuid(),
});
export const adjustStockSchema = baseMoveSchema.extend({
  locationId: z.uuid(),
  /** Positive = found more stock than expected; negative = found less. */
  direction: z.enum(["increase", "decrease"]),
  /** Required for an increase, since it brings new value into the company. */
  unitCost: z.number().min(0).optional(),
});

export type ReceiveStockInput = z.infer<typeof receiveStockSchema>;
export type DeliverStockInput = z.infer<typeof deliverStockSchema>;
export type TransferStockInput = z.infer<typeof transferStockSchema>;
export type AdjustStockInput = z.infer<typeof adjustStockSchema>;

/* ------------------------------------------------------------------ */
/* The primitive every public operation funnels through               */
/* ------------------------------------------------------------------ */

/**
 * Exported for cross-module use inside an ALREADY-OPEN tenant transaction --
 * P3's sales module calls this directly when a Delivery consumes stock, so
 * that creating the Delivery/DeliveryLine rows and the resulting StockMove
 * commit or fail together as one unit, rather than as two separate
 * transactions that could leave a Delivery with no matching stock movement.
 *
 * NO PERMISSION CHECK -- this is the primitive, not the public API. The
 * caller is responsible for asserting whatever permission gates ITS action
 * ("ship this sales order" is a sales:order permission, not a redundant
 * inventory:stock:move check on top of it). Every public function below
 * (receiveStock, deliverStock, ...) checks a permission before calling this.
 */
export interface RecordMoveArgs {
  tenantId: string;
  userId: string;
  type: MoveKind;
  productId: string;
  fromLocationId: string;
  toLocationId: string;
  quantity: number;
  /** In: the cost being brought in. Out: ignored -- computed from AVCO. */
  unitCost?: number;
  lotCode?: string | null;
  reference?: string | null;
  movedAt?: Date;
}

export async function recordMove(tx: TenantTransaction, args: RecordMoveArgs) {
  const [product, fromLocation, toLocation] = await Promise.all([
    tx.product.findUniqueOrThrow({ where: { id: args.productId } }),
    tx.location.findUniqueOrThrow({ where: { id: args.fromLocationId } }),
    tx.location.findUniqueOrThrow({ where: { id: args.toLocationId } }),
  ]);

  if (product.type !== "goods") {
    throw new Error(`"${product.name}" is a service, not a stock-tracked product.`);
  }

  let lotId: string | null = null;
  if (product.tracking !== "none") {
    if (!args.lotCode) {
      throw new Error(`"${product.name}" requires a lot/serial number for this move.`);
    }
    if (product.tracking === "serial" && args.quantity !== 1) {
      throw new Error(`"${product.name}" is serial-tracked: each move must be quantity 1.`);
    }
    const lot = await tx.lot.upsert({
      where: { tenantId_productId_code: { tenantId: args.tenantId, productId: args.productId, code: args.lotCode } },
      update: {},
      create: { tenantId: args.tenantId, productId: args.productId, code: args.lotCode },
      select: { id: true },
    });
    lotId = lot.id;
  }

  // Owned stock (internal/transit) must never go negative. External and
  // adjustment locations are virtual counterparties -- a SUPPLIERS location
  // "having" unlimited stock to send is exactly what makes it work as the
  // other side of a receipt, so no check applies there.
  const fromOwnsStock = fromLocation.kind === "internal" || fromLocation.kind === "transit";
  if (fromOwnsStock) {
    // Prisma.sql fragments compose (they build one query object); nesting a
    // second $queryRaw call here instead would execute it immediately and
    // try to stringify the resulting Promise into the outer query, which is
    // not valid SQL. Prisma.sql is the correct way to build a conditional
    // WHERE clause piece.
    const lotFilter = lotId ? Prisma.sql`"lotId" = ${lotId}::uuid` : Prisma.sql`"lotId" IS NULL`;

    // SELECT ... FOR UPDATE serialises concurrent moves against the SAME
    // product+location+lot row for the duration of this transaction, which
    // is what makes the sufficiency check below race-free: two deliveries
    // racing to consume the last 5 units cannot both read "5 available".
    const locked = await tx.$queryRaw<{ quantity: string }[]>(Prisma.sql`
      SELECT quantity FROM stock_quant
      WHERE "productId" = ${args.productId}::uuid
        AND "locationId" = ${args.fromLocationId}::uuid
        AND ${lotFilter}
      FOR UPDATE
    `);
    const available = locked.length > 0 ? Number(locked[0].quantity) : 0;
    if (available < args.quantity) {
      throw new Error(
        `Not enough stock of "${product.name}" at ${fromLocation.name}: ${available} available, ${args.quantity} requested.`
      );
    }
  }

  const move = await tx.stockMove.create({
    data: {
      tenantId: args.tenantId,
      type: args.type,
      productId: args.productId,
      fromLocationId: args.fromLocationId,
      toLocationId: args.toLocationId,
      lotId,
      quantity: args.quantity,
      // Receipts/increases carry a real cost; everything else is valued via
      // AVCO below and recorded on the move purely for the audit trail.
      unitCost: args.unitCost ?? 0,
      reference: args.reference ?? null,
      movedAt: args.movedAt ?? new Date(),
      createdBy: args.userId,
    },
  });

  // Atomic increment/decrement -- a single UPDATE statement, safe under
  // concurrency regardless of transaction isolation level. This is what
  // makes StockQuant provably a pure function of StockMove: it is never
  // computed by reading a value in JS and writing a new one back.
  if (fromOwnsStock) {
    await upsertQuant(tx, args.tenantId, args.productId, args.fromLocationId, lotId, -args.quantity);
  }
  if (toLocation.kind === "internal" || toLocation.kind === "transit") {
    await upsertQuant(tx, args.tenantId, args.productId, args.toLocationId, lotId, args.quantity);
  }

  // Valuation: only when stock crosses the company's ownership boundary.
  // internal -> internal (a transfer) never creates a layer -- the company
  // already owned the stock; moving shelves does not change its value.
  const entersOwnership = !fromOwnsStock && (toLocation.kind === "internal" || toLocation.kind === "transit");
  const leavesOwnership = fromOwnsStock && !(toLocation.kind === "internal" || toLocation.kind === "transit");

  let valuationEvent: StockValuedEvent | null = null;
  if (entersOwnership || leavesOwnership) {
    const layer = await recordValuationLayer(tx, args.tenantId, args.productId, move.id, {
      quantity: entersOwnership ? args.quantity : -args.quantity,
      unitCost: entersOwnership ? args.unitCost : undefined,
      movedAt: move.movedAt,
    });
    // Fire-and-forget by convention (see events.ts), but NOT emitted from
    // here -- this function runs inside a caller-owned transaction that
    // might still roll back. Callers collect this and emit() only after
    // their own withTenant() resolves, exactly like every other domain
    // event in the codebase (see e.g. invoices.ts's postInvoice).
    valuationEvent = {
      type: "stock.valued",
      tenantId: args.tenantId,
      moveId: move.id,
      moveType: args.type,
      productId: args.productId,
      internalLocationId: entersOwnership ? args.toLocationId : args.fromLocationId,
      value: layer.eventValue,
      quantity: args.quantity,
      movedAt: move.movedAt.toISOString(),
    };
  }

  return { move, valuationEvent };
}

async function upsertQuant(
  tx: TenantTransaction,
  tenantId: string,
  productId: string,
  locationId: string,
  lotId: string | null,
  delta: number
) {
  // A plain Prisma findFirst/where handles `lotId: null` correctly (it
  // compiles to `IS NULL`) -- the partial unique indexes in the migration
  // exist so the DATABASE enforces "one untracked row, many lot rows"; they
  // do not require raw SQL here, only for the FOR UPDATE lock above, which
  // Prisma has no query-builder API for at all.
  const existing = await tx.stockQuant.findFirst({
    where: { tenantId, productId, locationId, lotId },
    select: { id: true },
  });

  if (existing) {
    await tx.stockQuant.update({
      where: { id: existing.id },
      data: { quantity: { increment: delta } },
    });
  } else {
    await tx.stockQuant.create({
      data: { tenantId, productId, locationId, lotId, quantity: delta },
    });
  }
}

async function recordValuationLayer(
  tx: TenantTransaction,
  tenantId: string,
  productId: string,
  stockMoveId: string,
  event: { quantity: number; unitCost?: number; movedAt: Date }
) {
  const latest = await tx.stockValuationLayer.findFirst({
    where: { tenantId, productId },
    orderBy: [{ movedAt: "desc" }, { createdAt: "desc" }],
    select: { balanceQty: true, balanceValue: true },
  });

  const priorBalance = latest
    ? { qty: Number(latest.balanceQty), value: Number(latest.balanceValue) }
    : ZERO_BALANCE;

  const result = applyValuationEvent(priorBalance, event);

  await tx.stockValuationLayer.create({
    data: {
      tenantId,
      productId,
      stockMoveId,
      quantity: event.quantity,
      unitCost: result.eventUnitCost,
      value: result.eventValue,
      balanceQty: result.qty,
      balanceValue: result.value,
      movedAt: event.movedAt,
    },
  });

  return result;
}

/* ------------------------------------------------------------------ */
/* Public operations                                                   */
/* ------------------------------------------------------------------ */

async function resolveCounterpartyLocation(
  tx: TenantTransaction,
  tenantId: string,
  kind: "external" | "adjustment",
  code: "SUPPLIERS" | "CUSTOMERS" | "ADJUST"
) {
  return tx.location.findFirstOrThrow({ where: { tenantId, kind, code } });
}

export async function receiveStock(ctx: RequestContext, input: ReceiveStockInput) {
  assertPermission(ctx.permissions, "inventory:stock:move");
  const data = receiveStockSchema.parse(input);

  const result = await withTenant(ctx.tenantId, async (tx) => {
    const suppliers = await resolveCounterpartyLocation(tx, ctx.tenantId, "external", "SUPPLIERS");
    return recordMove(tx, {
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      type: "receipt",
      productId: data.productId,
      fromLocationId: suppliers.id,
      toLocationId: data.toLocationId,
      quantity: data.quantity,
      unitCost: data.unitCost,
      lotCode: data.lotCode,
      reference: data.reference,
      movedAt: data.movedAt,
    });
  });
  if (result.valuationEvent) emit(result.valuationEvent);
  return result.move.id;
}

export async function deliverStock(ctx: RequestContext, input: DeliverStockInput) {
  assertPermission(ctx.permissions, "inventory:stock:move");
  const data = deliverStockSchema.parse(input);

  const result = await withTenant(ctx.tenantId, async (tx) => {
    const customers = await resolveCounterpartyLocation(tx, ctx.tenantId, "external", "CUSTOMERS");
    return recordMove(tx, {
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      type: "delivery",
      productId: data.productId,
      fromLocationId: data.fromLocationId,
      toLocationId: customers.id,
      quantity: data.quantity,
      lotCode: data.lotCode,
      reference: data.reference,
      movedAt: data.movedAt,
    });
  });
  if (result.valuationEvent) emit(result.valuationEvent);
  return result.move.id;
}

export async function transferStock(ctx: RequestContext, input: TransferStockInput) {
  assertPermission(ctx.permissions, "inventory:stock:move");
  const data = transferStockSchema.parse(input);

  if (data.fromLocationId === data.toLocationId) {
    throw new Error("Source and destination cannot be the same location.");
  }

  const result = await withTenant(ctx.tenantId, async (tx) =>
    recordMove(tx, {
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      type: "transfer",
      productId: data.productId,
      fromLocationId: data.fromLocationId,
      toLocationId: data.toLocationId,
      lotCode: data.lotCode,
      quantity: data.quantity,
      reference: data.reference,
      movedAt: data.movedAt,
    })
  );
  // A transfer is always internal -> internal, so this is always null in
  // practice -- checked anyway rather than assumed, in case that ever changes.
  if (result.valuationEvent) emit(result.valuationEvent);
  return result.move.id;
}

export async function adjustStock(ctx: RequestContext, input: AdjustStockInput) {
  assertPermission(ctx.permissions, "inventory:stock:adjust");
  const data = adjustStockSchema.parse(input);

  if (data.direction === "increase" && data.unitCost === undefined) {
    throw new Error("A unit cost is required when increasing stock -- it brings new value into the company.");
  }

  const result = await withTenant(ctx.tenantId, async (tx) => {
    const adjustmentLoc = await resolveCounterpartyLocation(tx, ctx.tenantId, "adjustment", "ADJUST");
    return recordMove(tx, {
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      type: "adjustment",
      productId: data.productId,
      fromLocationId: data.direction === "increase" ? adjustmentLoc.id : data.locationId,
      toLocationId: data.direction === "increase" ? data.locationId : adjustmentLoc.id,
      quantity: data.quantity,
      unitCost: data.direction === "increase" ? data.unitCost : undefined,
      lotCode: data.lotCode,
      reference: data.reference ?? "Stock adjustment",
      movedAt: data.movedAt,
    });
  });
  if (result.valuationEvent) emit(result.valuationEvent);
  return result.move.id;
}

/* ------------------------------------------------------------------ */
/* Reports                                                             */
/* ------------------------------------------------------------------ */

/** On-hand + current AVCO value per product, summed across every location. */
export async function getStockLevels(ctx: RequestContext): Promise<StockLevelDTO[]> {
  assertPermission(ctx.permissions, "inventory:stock:read");

  return withTenant(ctx.tenantId, async (tx) => {
    const products = await tx.product.findMany({
      where: { type: "goods", deletedAt: null },
      select: { id: true, sku: true, name: true, reorderPoint: true, uom: { select: { code: true } } },
      orderBy: { name: "asc" },
    });
    if (products.length === 0) return [];

    const quants = await tx.stockQuant.groupBy({
      by: ["productId"],
      where: { productId: { in: products.map((p) => p.id) }, location: { kind: { in: ["internal", "transit"] } } },
      _sum: { quantity: true },
    });
    const onHandByProduct = new Map(quants.map((q) => [q.productId, Number(q._sum.quantity ?? 0)]));

    // Latest valuation layer per product gives the current AVCO balance.
    // Postgres DISTINCT ON is the natural "latest row per group" query;
    // Prisma has no first-class equivalent, so this is one raw query
    // instead of N findFirst calls.
    const latestLayers = await tx.$queryRaw<{ productId: string; balanceQty: string; balanceValue: string }[]>`
      SELECT DISTINCT ON ("productId") "productId", "balanceQty", "balanceValue"
      FROM stock_valuation_layer
      WHERE "productId" = ANY(${products.map((p) => p.id)}::uuid[])
      ORDER BY "productId", "movedAt" DESC, "createdAt" DESC
    `;
    const valuationByProduct = new Map(
      latestLayers.map((l) => [l.productId, { qty: Number(l.balanceQty), value: Number(l.balanceValue) }])
    );

    const showCost = canSeeCost(ctx);

    return products.map((p) => {
      const onHand = onHandByProduct.get(p.id) ?? 0;
      const val = valuationByProduct.get(p.id);
      const avgCost = val && val.qty > 0 ? val.value / val.qty : 0;
      const reorderPoint = p.reorderPoint ? Number(p.reorderPoint) : null;
      return {
        productId: p.id,
        sku: p.sku,
        name: p.name,
        uomCode: p.uom.code,
        onHand,
        averageCost: showCost ? avgCost : null,
        value: showCost ? Math.round(onHand * avgCost * 100) / 100 : null,
        reorderPoint,
        isLow: reorderPoint !== null && onHand < reorderPoint,
      };
    });
  });
}

export async function listMoves(ctx: RequestContext, productId?: string): Promise<StockMoveDTO[]> {
  assertPermission(ctx.permissions, "inventory:stock:read");

  return withTenant(ctx.tenantId, async (tx) => {
    const rows = await tx.stockMove.findMany({
      where: productId ? { productId } : undefined,
      include: {
        product: { select: { name: true, sku: true } },
        fromLocation: { select: { code: true } },
        toLocation: { select: { code: true } },
      },
      orderBy: { movedAt: "desc" },
      take: 200,
    });

    const showCost = canSeeCost(ctx);

    return rows.map((r) => ({
      id: r.id,
      type: r.type as MoveKind,
      productName: r.product.name,
      productSku: r.product.sku,
      fromLocationCode: r.fromLocation.code,
      toLocationCode: r.toLocation.code,
      quantity: Number(r.quantity.toString()),
      unitCost: showCost ? Number(r.unitCost.toString()) : null,
      reference: r.reference,
      movedAt: r.movedAt.toISOString(),
    }));
  });
}
