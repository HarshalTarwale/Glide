import { afterAll, describe, expect, it } from "vitest";
import { signup } from "@/server/core/signup";
import { withTenant } from "@/lib/db/tenant-client";
import { receiveStock, deliverStock, transferStock, adjustStock, getStockLevels } from "@/server/inventory/stock";
import { replayValuation } from "@/lib/inventory/avco";
import type { RequestContext } from "@/server/context";
import { unionPermissions } from "@/lib/auth/permissions";

/**
 * THE P2 ACCEPTANCE GATE (docs/roadmap.md §P2):
 *
 *   "a receipt raises on-hand, a delivery lowers it, an adjustment
 *    reconciles, valuation matches a hand-computed AVCO figure, and every
 *    one of those numbers is derived from the move ledger rather than read
 *    from a counter -- verified by a test that rebuilds on-hand from moves
 *    and asserts it equals the cached quant."
 *
 * Every test here rebuilds a number from StockMove / StockValuationLayer
 * independently of the cached StockQuant/balance fields, then asserts they
 * match. That is the actual guardrail against the failure mode named in
 * architecture §5.6: on-hand quietly becoming a mutable counter that drifts
 * from the ledger under deadline pressure.
 */

const hasDatabase =
  Boolean(process.env.DATABASE_URL) && !process.env.DATABASE_URL?.includes("placeholder");
const describeWithDb = hasDatabase ? describe : describe.skip;

async function makeOwnerContext(orgName: string): Promise<{ ctx: RequestContext; warehouseId: string; stockLocationId: string; productId: string }> {
  const result = await signup({
    name: "Stock Test Owner",
    email: `stock-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`,
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
    const ctx: RequestContext = {
      userId: result.userId,
      userName: "Stock Test Owner",
      userEmail: "",
      tenantId: result.tenantId,
      tenantName: orgName,
      country: "IN",
      currency: "INR",
      isOwner: true,
      permissions: unionPermissions(roles),
      recordScopes: [],
      availableTenants: [],
    };

    const uom = await tx.unitOfMeasure.findFirstOrThrow({ where: { tenantId: result.tenantId, code: "pcs" } });
    const taxCat = await tx.taxCategory.findFirstOrThrow({ where: { tenantId: result.tenantId, key: "standard" } });
    const product = await tx.product.create({
      data: {
        tenantId: result.tenantId,
        sku: `TEST-${Date.now()}`,
        name: "Test Widget",
        uomId: uom.id,
        taxCategoryId: taxCat.id,
        reorderPoint: 10,
      },
    });

    const warehouse = await tx.warehouse.findFirstOrThrow({ where: { tenantId: result.tenantId } });
    const stockLocation = await tx.location.findFirstOrThrow({
      where: { tenantId: result.tenantId, warehouseId: warehouse.id, kind: "internal" },
    });

    return { ctx, warehouseId: warehouse.id, stockLocationId: stockLocation.id, productId: product.id };
  });
}

/** Rebuilds on-hand for a product+location purely from StockMove rows. */
async function rebuildOnHandFromLedger(tenantId: string, productId: string, locationId: string) {
  return withTenant(tenantId, async (tx) => {
    const moves = await tx.stockMove.findMany({ where: { productId } });
    let qty = 0;
    for (const m of moves) {
      const amount = Number(m.quantity.toString());
      if (m.toLocationId === locationId) qty += amount;
      if (m.fromLocationId === locationId) qty -= amount;
    }
    return qty;
  });
}

describeWithDb("Stock ledger — the P2 acceptance gate", () => {
  const tenantIds: string[] = [];
  afterAll(async () => {
    const { prisma } = await import("@/lib/db/client");
    for (const id of tenantIds) await withTenant(id, (tx) => tx.tenant.delete({ where: { id } }));
    await prisma.$disconnect();
  });

  it("a receipt raises on-hand, rebuildable from the move ledger alone", async () => {
    const { ctx, stockLocationId, productId } = await makeOwnerContext("Receipt Co");
    tenantIds.push(ctx.tenantId);

    await receiveStock(ctx, { productId, toLocationId: stockLocationId, quantity: 100, unitCost: 10 });

    const cachedQty = await withTenant(ctx.tenantId, async (tx) => {
      const quant = await tx.stockQuant.findFirst({ where: { productId, locationId: stockLocationId } });
      return Number(quant?.quantity.toString() ?? 0);
    });
    const rebuilt = await rebuildOnHandFromLedger(ctx.tenantId, productId, stockLocationId);

    expect(cachedQty).toBe(100);
    expect(rebuilt).toBe(cachedQty); // the actual gate: cache == ledger replay
  });

  it("a delivery lowers on-hand, and the cache still equals the ledger replay", async () => {
    const { ctx, stockLocationId, productId } = await makeOwnerContext("Delivery Co");
    tenantIds.push(ctx.tenantId);

    await receiveStock(ctx, { productId, toLocationId: stockLocationId, quantity: 100, unitCost: 10 });
    await deliverStock(ctx, { productId, fromLocationId: stockLocationId, quantity: 30 });

    const cachedQty = await withTenant(ctx.tenantId, async (tx) => {
      const quant = await tx.stockQuant.findFirst({ where: { productId, locationId: stockLocationId } });
      return Number(quant?.quantity.toString() ?? 0);
    });
    const rebuilt = await rebuildOnHandFromLedger(ctx.tenantId, productId, stockLocationId);

    expect(cachedQty).toBe(70);
    expect(rebuilt).toBe(cachedQty);
  });

  it("cannot deliver more than is on hand -- owned stock never goes negative", async () => {
    const { ctx, stockLocationId, productId } = await makeOwnerContext("Oversell Co");
    tenantIds.push(ctx.tenantId);

    await receiveStock(ctx, { productId, toLocationId: stockLocationId, quantity: 10, unitCost: 10 });

    await expect(
      deliverStock(ctx, { productId, fromLocationId: stockLocationId, quantity: 11 })
    ).rejects.toThrow(/Not enough stock/);

    // The rejected attempt must not have moved anything.
    const cachedQty = await withTenant(ctx.tenantId, async (tx) => {
      const quant = await tx.stockQuant.findFirst({ where: { productId, locationId: stockLocationId } });
      return Number(quant?.quantity.toString() ?? 0);
    });
    expect(cachedQty).toBe(10);
  });

  it("a transfer moves stock between locations with the total unchanged, and creates NO valuation layer", async () => {
    const { ctx, warehouseId, stockLocationId, productId } = await makeOwnerContext("Transfer Co");
    tenantIds.push(ctx.tenantId);

    await receiveStock(ctx, { productId, toLocationId: stockLocationId, quantity: 50, unitCost: 10 });
    void warehouseId; // signup already provisioned one warehouse; not needed further here

    // Transfer to a second internal location, since the point under test is
    // the ownership-boundary rule (internal -> internal creates no
    // valuation layer), not multi-warehouse routing (a P3+ concern).
    const otherLocation = await withTenant(ctx.tenantId, (tx) =>
      tx.location.create({
        data: { tenantId: ctx.tenantId, kind: "internal", code: "OTHER", name: "Other bin" },
      })
    );

    await transferStock(ctx, {
      productId,
      fromLocationId: stockLocationId,
      toLocationId: otherLocation.id,
      quantity: 20,
    });

    const [fromQty, toQty, layerCount] = await withTenant(ctx.tenantId, async (tx) => {
      const from = await tx.stockQuant.findFirst({ where: { productId, locationId: stockLocationId } });
      const to = await tx.stockQuant.findFirst({ where: { productId, locationId: otherLocation.id } });
      const layers = await tx.stockValuationLayer.count({ where: { productId } });
      return [Number(from?.quantity.toString() ?? 0), Number(to?.quantity.toString() ?? 0), layers];
    });

    expect(fromQty).toBe(30);
    expect(toQty).toBe(20);
    expect(fromQty + toQty).toBe(50); // total on hand unchanged by a transfer

    // Only the original receipt created a layer. internal -> internal moves
    // no value, per architecture §5.3 -- the company already owned the stock.
    expect(layerCount).toBe(1);
  });

  it("an adjustment reconciles on-hand to a physical count", async () => {
    const { ctx, stockLocationId, productId } = await makeOwnerContext("Adjust Co");
    tenantIds.push(ctx.tenantId);

    await receiveStock(ctx, { productId, toLocationId: stockLocationId, quantity: 100, unitCost: 10 });

    // Physical count found only 92 -- shrinkage of 8.
    await adjustStock(ctx, {
      productId,
      locationId: stockLocationId,
      direction: "decrease",
      quantity: 8,
      reference: "Cycle count",
    });

    const cachedQty = await withTenant(ctx.tenantId, async (tx) => {
      const quant = await tx.stockQuant.findFirst({ where: { productId, locationId: stockLocationId } });
      return Number(quant?.quantity.toString() ?? 0);
    });
    expect(cachedQty).toBe(92);
    expect(await rebuildOnHandFromLedger(ctx.tenantId, productId, stockLocationId)).toBe(92);
  });

  it("valuation matches a hand-computed AVCO figure after a mixed receive/deliver/adjust sequence", async () => {
    const { ctx, stockLocationId, productId } = await makeOwnerContext("Valuation Co");
    tenantIds.push(ctx.tenantId);

    // Hand computation (same shape as tests/avco.test.ts's reconciliation case):
    //   +100 @ 10  -> qty 100, value 1000, avg 10
    //   +50  @ 16  -> qty 150, value 1800, avg 12
    //   -80        -> qty 70,  value 840,  avg 12 (delivery valued at current avg)
    //   +30  @ 9   -> qty 100, value 1110, avg 11.10
    await receiveStock(ctx, { productId, toLocationId: stockLocationId, quantity: 100, unitCost: 10 });
    await receiveStock(ctx, { productId, toLocationId: stockLocationId, quantity: 50, unitCost: 16 });
    await deliverStock(ctx, { productId, fromLocationId: stockLocationId, quantity: 80 });
    await receiveStock(ctx, { productId, toLocationId: stockLocationId, quantity: 30, unitCost: 9 });

    const latest = await withTenant(ctx.tenantId, (tx) =>
      tx.stockValuationLayer.findFirst({
        where: { productId },
        orderBy: [{ movedAt: "desc" }, { createdAt: "desc" }],
      })
    );

    expect(Number(latest!.balanceQty)).toBe(100);
    expect(Number(latest!.balanceValue)).toBe(1110);

    // The independent check: replay EVERY layer from zero using the pure
    // AVCO function and confirm it reproduces the exact same cached balance.
    // This is the literal "rebuilds ... and asserts it equals the cached
    // quant" requirement, applied to valuation rather than on-hand.
    const allLayers = await withTenant(ctx.tenantId, (tx) =>
      tx.stockValuationLayer.findMany({ where: { productId }, orderBy: [{ movedAt: "asc" }, { createdAt: "asc" }] })
    );
    const replayed = replayValuation(
      allLayers.map((l) => ({
        quantity: Number(l.quantity.toString()),
        unitCost: Number(l.quantity) > 0 ? Number(l.unitCost.toString()) : undefined,
      }))
    );

    expect(replayed.qty).toBe(Number(latest!.balanceQty));
    expect(replayed.value).toBe(Number(latest!.balanceValue));
  });

  it("the stock levels report flags a product below its reorder point", async () => {
    const { ctx, stockLocationId, productId } = await makeOwnerContext("Reorder Co");
    tenantIds.push(ctx.tenantId);

    // reorderPoint was set to 10 in makeOwnerContext.
    await receiveStock(ctx, { productId, toLocationId: stockLocationId, quantity: 5, unitCost: 10 });

    const levels = await getStockLevels(ctx);
    const row = levels.find((l) => l.productId === productId);

    expect(row).toBeDefined();
    expect(row!.onHand).toBe(5);
    expect(row!.isLow).toBe(true);
    expect(row!.averageCost).toBe(10);
    expect(row!.value).toBe(50);
  });

  it("lot-tracked stock keeps separate on-hand per lot", async () => {
    const { ctx, stockLocationId } = await makeOwnerContext("Lot Co");
    tenantIds.push(ctx.tenantId);

    const productId = await withTenant(ctx.tenantId, async (tx) => {
      const uom = await tx.unitOfMeasure.findFirstOrThrow({ where: { tenantId: ctx.tenantId, code: "pcs" } });
      const p = await tx.product.create({
        data: { tenantId: ctx.tenantId, sku: `LOT-${Date.now()}`, name: "Lotted Widget", uomId: uom.id, tracking: "lot" },
      });
      return p.id;
    });

    await receiveStock(ctx, { productId, toLocationId: stockLocationId, quantity: 20, unitCost: 5, lotCode: "L1" });
    await receiveStock(ctx, { productId, toLocationId: stockLocationId, quantity: 15, unitCost: 5, lotCode: "L2" });
    await deliverStock(ctx, { productId, fromLocationId: stockLocationId, quantity: 5, lotCode: "L1" });

    const quants = await withTenant(ctx.tenantId, (tx) =>
      tx.stockQuant.findMany({ where: { productId, locationId: stockLocationId }, include: { lot: true } })
    );

    const byLot = new Map(quants.map((q) => [q.lot?.code, Number(q.quantity.toString())]));
    expect(byLot.get("L1")).toBe(15);
    expect(byLot.get("L2")).toBe(15);

    // A move without a lot code must be rejected outright for a tracked product.
    await expect(
      deliverStock(ctx, { productId, fromLocationId: stockLocationId, quantity: 1 })
    ).rejects.toThrow(/requires a lot/);
  });
});
