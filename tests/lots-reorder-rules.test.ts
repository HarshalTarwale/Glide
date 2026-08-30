import { afterAll, describe, expect, it } from "vitest";
import { signup } from "@/server/core/signup";
import { withTenant } from "@/lib/db/tenant-client";
import { receiveStock } from "@/server/inventory/stock";
import { listLots, updateLotExpiry } from "@/server/inventory/lots";
import { createReorderRule, updateReorderRule, deleteReorderRule, listReorderRules } from "@/server/inventory/reorder-rules";
import type { RequestContext } from "@/server/context";
import { unionPermissions } from "@/lib/auth/permissions";

/**
 * Verifies the two P2 items closed after the initial inventory pass:
 * lot/serial visibility (tests/stock-ledger.test.ts already covers that the
 * LEDGER separates on-hand by lot; this covers that the REPORT surfaces it
 * correctly) and per-warehouse ReorderRule CRUD.
 */

const hasDatabase =
  Boolean(process.env.DATABASE_URL) && !process.env.DATABASE_URL?.includes("placeholder");
const describeWithDb = hasDatabase ? describe : describe.skip;

async function makeOwnerContext(orgName: string) {
  const result = await signup({
    name: "Test Owner",
    email: `lot-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`,
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
      userName: "Test Owner",
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
    const warehouse = await tx.warehouse.findFirstOrThrow({ where: { tenantId: result.tenantId } });
    const stockLocation = await tx.location.findFirstOrThrow({
      where: { tenantId: result.tenantId, warehouseId: warehouse.id, kind: "internal" },
    });

    return { ctx, uomId: uom.id, warehouseId: warehouse.id, stockLocationId: stockLocation.id };
  });
}

describeWithDb("Lots (traceability report)", () => {
  const tenantIds: string[] = [];
  afterAll(async () => {
    const { prisma } = await import("@/lib/db/client");
    for (const id of tenantIds) await withTenant(id, (tx) => tx.tenant.delete({ where: { id } }));
    await prisma.$disconnect();
  });

  it("surfaces on-hand per lot, matching what the ledger already tracks", async () => {
    const { ctx, uomId, stockLocationId } = await makeOwnerContext("Lot Report Co");
    tenantIds.push(ctx.tenantId);

    const productId = await withTenant(ctx.tenantId, async (tx) => {
      const p = await tx.product.create({
        data: { tenantId: ctx.tenantId, sku: `LOTREP-${Date.now()}`, name: "Batch Widget", uomId, tracking: "lot" },
      });
      return p.id;
    });

    await receiveStock(ctx, { productId, toLocationId: stockLocationId, quantity: 100, unitCost: 5, lotCode: "BATCH-A" });
    await receiveStock(ctx, { productId, toLocationId: stockLocationId, quantity: 50, unitCost: 5, lotCode: "BATCH-B" });

    const lots = await listLots(ctx);
    const a = lots.find((l) => l.code === "BATCH-A");
    const b = lots.find((l) => l.code === "BATCH-B");

    expect(a?.onHand).toBe(100);
    expect(b?.onHand).toBe(50);
    expect(a?.expiresAt).toBeNull();
  });

  it("setting an expiry flags a lot as expiring soon once within 30 days", async () => {
    const { ctx, uomId, stockLocationId } = await makeOwnerContext("Expiry Co");
    tenantIds.push(ctx.tenantId);

    const productId = await withTenant(ctx.tenantId, async (tx) => {
      const p = await tx.product.create({
        data: { tenantId: ctx.tenantId, sku: `EXP-${Date.now()}`, name: "Perishable Widget", uomId, tracking: "lot" },
      });
      return p.id;
    });

    await receiveStock(ctx, { productId, toLocationId: stockLocationId, quantity: 10, unitCost: 5, lotCode: "SOON" });

    const [lot] = await listLots(ctx);
    const soon = new Date();
    soon.setDate(soon.getDate() + 5);
    await updateLotExpiry(ctx, lot.id, { expiresAt: soon });

    const updated = await listLots(ctx);
    const flagged = updated.find((l) => l.code === "SOON");
    expect(flagged?.isExpiringSoon).toBe(true);

    // Clearing it back to null must also clear the flag.
    await updateLotExpiry(ctx, lot.id, { expiresAt: null });
    const cleared = await listLots(ctx);
    expect(cleared.find((l) => l.code === "SOON")?.isExpiringSoon).toBe(false);
  });
});

describeWithDb("Reorder rules (per-warehouse thresholds)", () => {
  const tenantIds: string[] = [];
  afterAll(async () => {
    const { prisma } = await import("@/lib/db/client");
    for (const id of tenantIds) await withTenant(id, (tx) => tx.tenant.delete({ where: { id } }));
    await prisma.$disconnect();
  });

  it("creates, updates and deletes a rule scoped to product + warehouse", async () => {
    const { ctx, uomId, warehouseId } = await makeOwnerContext("Reorder Co");
    tenantIds.push(ctx.tenantId);

    const productId = await withTenant(ctx.tenantId, async (tx) => {
      const p = await tx.product.create({
        data: { tenantId: ctx.tenantId, sku: `REORD-${Date.now()}`, name: "Reordered Widget", uomId },
      });
      return p.id;
    });

    const rule = await createReorderRule(ctx, { productId, warehouseId, minQty: 20, maxQty: 100 });
    expect(rule.minQty).toBe(20);
    expect(rule.maxQty).toBe(100);
    expect(rule.warehouseName).toBeTruthy();

    const listed = await listReorderRules(ctx);
    expect(listed.find((r) => r.id === rule.id)).toBeDefined();

    const updated = await updateReorderRule(ctx, rule.id, { minQty: 30 });
    expect(updated.minQty).toBe(30);
    expect(updated.maxQty).toBe(100); // untouched field survives a partial update

    await deleteReorderRule(ctx, rule.id);
    const afterDelete = await listReorderRules(ctx);
    expect(afterDelete.find((r) => r.id === rule.id)).toBeUndefined();
  });

  it("enforces one rule per product+warehouse pair", async () => {
    const { ctx, uomId, warehouseId } = await makeOwnerContext("Duplicate Rule Co");
    tenantIds.push(ctx.tenantId);

    const productId = await withTenant(ctx.tenantId, async (tx) => {
      const p = await tx.product.create({
        data: { tenantId: ctx.tenantId, sku: `DUP-${Date.now()}`, name: "Duplicate Widget", uomId },
      });
      return p.id;
    });

    await createReorderRule(ctx, { productId, warehouseId, minQty: 10 });
    await expect(createReorderRule(ctx, { productId, warehouseId, minQty: 20 })).rejects.toThrow();
  });
});
