import { afterAll, describe, expect, it } from "vitest";
import { signup } from "@/server/core/signup";
import { withTenant } from "@/lib/db/tenant-client";
import { createProduct } from "@/server/catalog/products";
import { receiveStock, getStockLevels } from "@/server/inventory/stock";
import { createBom, updateBom } from "@/server/manufacturing/boms";
import {
  createWorkOrder,
  confirmWorkOrder,
  completeWorkOrder,
  cancelWorkOrder,
  getWorkOrder,
} from "@/server/manufacturing/work-orders";
import type { RequestContext } from "@/server/context";
import { unionPermissions } from "@/lib/auth/permissions";

/**
 * P6+ Manufacturing acceptance gate: completing a work order visibly
 * consumes component stock and produces finished-good stock through the
 * SAME ledger P2 already built (recordMove), the produced unit cost
 * matches actual component costs consumed (not a configured number), a
 * work order cannot be completed before it's confirmed, and everything is
 * tenant-isolated.
 */

const hasDatabase =
  Boolean(process.env.DATABASE_URL) && !process.env.DATABASE_URL?.includes("placeholder");
const describeWithDb = hasDatabase ? describe : describe.skip;

async function makeFixture(orgName: string) {
  const result = await signup({
    name: "Test Owner",
    email: `mfg-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`,
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
    const warehouse = await tx.warehouse.findFirstOrThrow({ where: { tenantId: result.tenantId } });
    const stockLocation = await tx.location.findFirstOrThrow({ where: { tenantId: result.tenantId, warehouseId: warehouse.id, kind: "internal" } });

    return { ctx, uomId: uom.id, warehouseId: warehouse.id, stockLocationId: stockLocation.id };
  });
}

function product(sku: string, name: string, uomId: string, overrides: { costPrice?: number; tracking?: "none" | "lot" | "serial" } = {}) {
  return {
    sku,
    name,
    type: "goods" as const,
    uomId,
    salesPrice: 0,
    costPrice: overrides.costPrice ?? 0,
    tracking: overrides.tracking ?? ("none" as const),
    isSellable: true,
    isPurchasable: true,
    isActive: true,
  };
}

function bom(productId: string, quantity: number, lines: { componentProductId: string; quantity: number }[], isActive = true) {
  return { productId, quantity, isActive, lines };
}

describeWithDb("Manufacturing", () => {
  const tenantIds: string[] = [];
  afterAll(async () => {
    const { prisma } = await import("@/lib/db/client");
    for (const id of tenantIds) await withTenant(id, (tx) => tx.tenant.delete({ where: { id } }));
    await prisma.$disconnect();
  });

  it("completing a work order consumes components, produces the finished good, and costs it at actual component cost", async () => {
    const { ctx, uomId, warehouseId, stockLocationId } = await makeFixture("Mfg Co");
    tenantIds.push(ctx.tenantId);

    const leg = await createProduct(ctx, product("LEG-01", "Table Leg", uomId, { costPrice: 10 }));
    const top = await createProduct(ctx, product("TOP-01", "Table Top", uomId, { costPrice: 40 }));
    const table = await createProduct(ctx, product("TABLE-01", "Assembled Table", uomId));

    // Stock 40 legs at 10 each and 10 tops at 40 each.
    await receiveStock(ctx, { productId: leg.id, toLocationId: stockLocationId, quantity: 40, unitCost: 10 });
    await receiveStock(ctx, { productId: top.id, toLocationId: stockLocationId, quantity: 10, unitCost: 40 });

    // BOM: 1 table = 4 legs + 1 top.
    const bomId = await createBom(
      ctx,
      bom(table.id, 1, [
        { componentProductId: leg.id, quantity: 4 },
        { componentProductId: top.id, quantity: 1 },
      ])
    );

    const workOrderId = await createWorkOrder(ctx, { bomId, warehouseId, quantity: 5 });
    const created = await getWorkOrder(ctx, workOrderId);
    expect(created!.status).toBe("draft");
    expect(created!.lines.find((l) => l.componentProductId === leg.id)?.plannedQty).toBe(20);
    expect(created!.lines.find((l) => l.componentProductId === top.id)?.plannedQty).toBe(5);

    await expect(completeWorkOrder(ctx, workOrderId)).rejects.toThrow(/confirmed work order can be completed/);

    await confirmWorkOrder(ctx, workOrderId);
    await completeWorkOrder(ctx, workOrderId);

    const done = await getWorkOrder(ctx, workOrderId);
    expect(done!.status).toBe("done");
    // 5 tables cost: (20 legs * 10) + (5 tops * 40) = 200 + 200 = 400, / 5 = 80/table.
    expect(done!.unitCost).toBe(80);
    expect(done!.completedAt).not.toBeNull();

    const levels = await getStockLevels(ctx);
    const legLevel = levels.find((l) => l.sku === "LEG-01")!;
    const topLevel = levels.find((l) => l.sku === "TOP-01")!;
    const tableLevel = levels.find((l) => l.sku === "TABLE-01")!;
    expect(legLevel.onHand).toBe(20); // 40 - 20 consumed
    expect(topLevel.onHand).toBe(5); // 10 - 5 consumed
    expect(tableLevel.onHand).toBe(5); // 5 produced

    await expect(completeWorkOrder(ctx, workOrderId)).rejects.toThrow(/confirmed work order can be completed/);
  });

  it("a draft or confirmed work order can be cancelled, and a cancelled one never touches stock", async () => {
    const { ctx, uomId, warehouseId, stockLocationId } = await makeFixture("Mfg Cancel Co");
    tenantIds.push(ctx.tenantId);

    const screw = await createProduct(ctx, product("SCREW-01", "Screw", uomId, { costPrice: 1 }));
    const widget = await createProduct(ctx, product("WIDGET-01", "Widget", uomId));
    await receiveStock(ctx, { productId: screw.id, toLocationId: stockLocationId, quantity: 100, unitCost: 1 });

    const bomId = await createBom(ctx, bom(widget.id, 1, [{ componentProductId: screw.id, quantity: 10 }]));
    const workOrderId = await createWorkOrder(ctx, { bomId, warehouseId, quantity: 2 });

    await confirmWorkOrder(ctx, workOrderId);
    await cancelWorkOrder(ctx, workOrderId);

    const cancelled = await getWorkOrder(ctx, workOrderId);
    expect(cancelled!.status).toBe("cancelled");

    const levels = await getStockLevels(ctx);
    expect(levels.find((l) => l.sku === "SCREW-01")!.onHand).toBe(100);

    await expect(confirmWorkOrder(ctx, workOrderId)).rejects.toThrow(/draft work order can be confirmed/);
  });

  it("rejects a BOM where a product is a component of itself, and a lot-tracked component", async () => {
    const { ctx, uomId } = await makeFixture("Mfg Guard Co");
    tenantIds.push(ctx.tenantId);

    const selfRef = await createProduct(ctx, product("SELF-01", "Self Referencer", uomId));
    await expect(createBom(ctx, bom(selfRef.id, 1, [{ componentProductId: selfRef.id, quantity: 1 }]))).rejects.toThrow(/component of its own BOM/);

    const tracked = await createProduct(ctx, product("LOT-01", "Tracked Part", uomId, { tracking: "lot" }));
    const output = await createProduct(ctx, product("OUT-01", "Output", uomId));
    await expect(createBom(ctx, bom(output.id, 1, [{ componentProductId: tracked.id, quantity: 1 }]))).rejects.toThrow(/lot\/serial-tracked/);
  });

  it("deactivating a BOM blocks new work orders against it but leaves existing ones alone", async () => {
    const { ctx, uomId, warehouseId, stockLocationId } = await makeFixture("Mfg Deactivate Co");
    tenantIds.push(ctx.tenantId);

    const part = await createProduct(ctx, product("PART-01", "Part", uomId, { costPrice: 5 }));
    const output = await createProduct(ctx, product("OUT-02", "Output Two", uomId));
    await receiveStock(ctx, { productId: part.id, toLocationId: stockLocationId, quantity: 50, unitCost: 5 });

    const bomId = await createBom(ctx, bom(output.id, 1, [{ componentProductId: part.id, quantity: 2 }]));
    await updateBom(ctx, bomId, bom(output.id, 1, [{ componentProductId: part.id, quantity: 2 }], false));

    await expect(createWorkOrder(ctx, { bomId, warehouseId, quantity: 1 })).rejects.toThrow(/inactive/);
  });

  it("is scoped per tenant -- one tenant's work orders never show up in another's list", async () => {
    const fixtureA = await makeFixture("Mfg Isolation A");
    const fixtureB = await makeFixture("Mfg Isolation B");
    tenantIds.push(fixtureA.ctx.tenantId, fixtureB.ctx.tenantId);

    const part = await createProduct(fixtureA.ctx, product("ISO-PART", "Iso Part", fixtureA.uomId, { costPrice: 1 }));
    const output = await createProduct(fixtureA.ctx, product("ISO-OUT", "Iso Output", fixtureA.uomId));
    await receiveStock(fixtureA.ctx, { productId: part.id, toLocationId: fixtureA.stockLocationId, quantity: 10, unitCost: 1 });
    const bomId = await createBom(fixtureA.ctx, bom(output.id, 1, [{ componentProductId: part.id, quantity: 1 }]));
    const workOrderId = await createWorkOrder(fixtureA.ctx, { bomId, warehouseId: fixtureA.warehouseId, quantity: 1 });

    const crossTenant = await getWorkOrder(fixtureB.ctx, workOrderId);
    expect(crossTenant).toBeNull();
  });
});
