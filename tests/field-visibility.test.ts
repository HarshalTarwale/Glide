import { afterAll, describe, expect, it } from "vitest";
import { signup } from "@/server/core/signup";
import { withTenant } from "@/lib/db/tenant-client";
import { receiveStock, getStockLevels, listMoves } from "@/server/inventory/stock";
import type { RequestContext } from "@/server/context";
import { unionPermissions } from "@/lib/auth/permissions";

/**
 * THE P5 FIELD-VISIBILITY GATE (permission layer 4, docs/roadmap.md's
 * "field-level permissions" line): proves the gate closed in
 * src/server/inventory/stock.ts actually applies end to end, not just that
 * canSeeCost() (tests/permissions.test.ts) returns the right boolean in
 * isolation. Same data, two different sessions, two different payloads.
 */

const hasDatabase =
  Boolean(process.env.DATABASE_URL) && !process.env.DATABASE_URL?.includes("placeholder");
const describeWithDb = hasDatabase ? describe : describe.skip;

describeWithDb("Cost/valuation field visibility (permission layer 4)", () => {
  const tenantIds: string[] = [];
  afterAll(async () => {
    const { prisma } = await import("@/lib/db/client");
    for (const id of tenantIds) await withTenant(id, (tx) => tx.tenant.delete({ where: { id } }));
    await prisma.$disconnect();
  });

  it("an owner sees cost/value; a warehouse-shaped session over the SAME tenant data sees null", async () => {
    const result = await signup({
      name: "Field Visibility Owner",
      email: `field-vis-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`,
      password: "password123",
      organisation: "Field Visibility Co",
      country: "IN",
    });
    if (!result.ok) throw new Error(result.error);
    tenantIds.push(result.tenantId);

    const { ownerCtx, uomId, taxCategoryId, stockLocationId } = await withTenant(result.tenantId, async (tx) => {
      const membership = await tx.membership.findFirstOrThrow({
        where: { tenantId: result.tenantId, userId: result.userId },
        include: { roles: { include: { role: true } } },
      });
      const roles = membership.roles.map((r) => r.role);
      const ctx: RequestContext = {
        userId: result.userId,
        userName: "Field Visibility Owner",
        userEmail: "",
        tenantId: result.tenantId,
        tenantName: "Field Visibility Co",
        country: "IN",
        currency: "INR",
        isOwner: true,
        permissions: unionPermissions(roles),
        recordScopes: [],
        availableTenants: [],
      };
      const uom = await tx.unitOfMeasure.findFirstOrThrow({ where: { tenantId: result.tenantId, code: "pcs" } });
      const taxCat = await tx.taxCategory.findFirstOrThrow({ where: { tenantId: result.tenantId, key: "standard" } });
      const warehouse = await tx.warehouse.findFirstOrThrow({ where: { tenantId: result.tenantId } });
      const stockLocation = await tx.location.findFirstOrThrow({
        where: { tenantId: result.tenantId, warehouseId: warehouse.id, kind: "internal" },
      });
      return { ownerCtx: ctx, uomId: uom.id, taxCategoryId: taxCat.id, stockLocationId: stockLocation.id };
    });

    const productId = await withTenant(result.tenantId, async (tx) => {
      const p = await tx.product.create({
        data: { tenantId: result.tenantId, sku: `FV-${Date.now()}`, name: "Cost-Sensitive Widget", uomId, taxCategoryId, salesPrice: 200 },
      });
      return p.id;
    });
    await receiveStock(ownerCtx, { productId, toLocationId: stockLocationId, quantity: 20, unitCost: 75 });

    // Same tenant, same underlying rows -- a session shaped exactly like the
    // Warehouse SYSTEM_ROLE (inventory:stock:read/move/adjust, no
    // inventory:product:write, not the tenant owner).
    const warehouseCtx: RequestContext = {
      ...ownerCtx,
      isOwner: false,
      permissions: new Set(["inventory:stock:read", "inventory:stock:move", "inventory:stock:adjust", "inventory:warehouse:read"]),
    };

    const ownerLevels = await getStockLevels(ownerCtx);
    const warehouseLevels = await getStockLevels(warehouseCtx);
    const ownerLevel = ownerLevels.find((l) => l.productId === productId)!;
    const warehouseLevel = warehouseLevels.find((l) => l.productId === productId)!;

    expect(ownerLevel.averageCost).toBe(75);
    expect(ownerLevel.value).toBe(1500);
    expect(warehouseLevel.averageCost).toBeNull();
    expect(warehouseLevel.value).toBeNull();
    // The quantity itself -- what a warehouse worker actually needs -- is
    // never hidden, only the money.
    expect(warehouseLevel.onHand).toBe(ownerLevel.onHand);

    const ownerMoves = await listMoves(ownerCtx, productId);
    const warehouseMoves = await listMoves(warehouseCtx, productId);
    expect(ownerMoves[0].unitCost).toBe(75);
    expect(warehouseMoves[0].unitCost).toBeNull();
    expect(warehouseMoves[0].quantity).toBe(ownerMoves[0].quantity);
  });
});
