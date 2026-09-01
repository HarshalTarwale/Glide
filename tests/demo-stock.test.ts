import { describe, expect, it } from "vitest";
import { withTenant, withUser } from "@/lib/db/tenant-client";
import { receiveStock, getStockLevels } from "@/server/inventory/stock";
import type { RequestContext } from "@/server/context";
import { unionPermissions } from "@/lib/auth/permissions";

/**
 * Receives real opening stock into the demo tenant (demo@glide.app), so the
 * Stock Levels screen has something to show on first look rather than an
 * all-zero report. Gated the same way as demo-data.test.ts: not part of the
 * normal suite, safe to re-run (skips a SKU already at its target quantity
 * rather than double-receiving it).
 *
 * Usage: SEED_DEMO=1 npx vitest run tests/demo-stock.test.ts
 */

const hasDatabase =
  Boolean(process.env.DATABASE_URL) && !process.env.DATABASE_URL?.includes("placeholder");
const enabled = hasDatabase && process.env.SEED_DEMO === "1";
const describeWithDb = enabled ? describe : describe.skip;

const DEMO_EMAIL = "demo@glide.app";

const OPENING_STOCK: { sku: string; qty: number; cost: number }[] = [
  { sku: "BRG-6204ZZ", qty: 240, cost: 215 },
  { sku: "BLT-A42HD", qty: 60, cost: 410 },
  { sku: "MTR-1HP-3P", qty: 12, cost: 6100 },
  { sku: "LUB-EP2-5K", qty: 40, cost: 870 },
  { sku: "CBL-4C-25M", qty: 25, cost: 3150 },
  { sku: "VLV-BALL-2", qty: 35, cost: 1240 },
  { sku: "FLT-HYD-10", qty: 50, cost: 1480 },
];

describeWithDb("demo opening stock", () => {
  it("receives opening stock for the demo tenant's catalogue", async () => {
    const { prisma } = await import("@/lib/db/client");
    const user = await prisma.user.findUnique({ where: { email: DEMO_EMAIL }, select: { id: true } });
    if (!user) throw new Error(`Demo user ${DEMO_EMAIL} not found -- run demo-data.test.ts first.`);

    const memberships = await withUser(user.id, (tx) => tx.membership.findMany({ where: { userId: user.id } }));
    const tenantId = memberships[0].tenantId;

    const ctx = await withTenant(tenantId, async (tx) => {
      const membership = await tx.membership.findFirstOrThrow({
        where: { tenantId, userId: user.id },
        include: { roles: { include: { role: true } } },
      });
      const tenant = await tx.tenant.findUniqueOrThrow({ where: { id: tenantId } });
      const context: RequestContext = {
        userId: user.id,
        userName: "Demo User",
        userEmail: DEMO_EMAIL,
        tenantId,
        tenantName: tenant.name,
        country: tenant.country,
        currency: tenant.currency,
        isOwner: membership.isOwner,
        permissions: unionPermissions(membership.roles.map((r) => r.role)),
        recordScopes: [],
        availableTenants: [],
      };
      return context;
    });

    const { products, stockLocationId } = await withTenant(tenantId, async (tx) => {
      const rows = await tx.product.findMany({ where: { tenantId, type: "goods" }, select: { id: true, sku: true } });
      const warehouse = await tx.warehouse.findFirstOrThrow({ where: { tenantId } });
      const location = await tx.location.findFirstOrThrow({ where: { tenantId, warehouseId: warehouse.id, kind: "internal" } });
      return { products: rows, stockLocationId: location.id };
    });
    const productBySku = new Map(products.map((p) => [p.sku, p.id]));

    const existingLevels = await getStockLevels(ctx);
    const onHandBySku = new Map(existingLevels.map((l) => [l.sku, l.onHand]));

    let received = 0;
    for (const item of OPENING_STOCK) {
      const productId = productBySku.get(item.sku);
      if (!productId) {
        console.warn(`  SKIP ${item.sku}: not found in this tenant's catalogue.`);
        continue;
      }
      if ((onHandBySku.get(item.sku) ?? 0) >= item.qty) {
        console.log(`  SKIP ${item.sku}: already has ${onHandBySku.get(item.sku)} on hand.`);
        continue;
      }
      await receiveStock(ctx, {
        productId,
        toLocationId: stockLocationId,
        quantity: item.qty,
        unitCost: item.cost,
        reference: "Opening stock",
      });
      received++;
    }

    const finalLevels = await getStockLevels(ctx);
    const totalValue = finalLevels.reduce((sum, l) => sum + (l.value ?? 0), 0);
    console.log(`\n  Received opening stock for ${received} SKU(s). Total stock value now ~${totalValue}.\n`);

    expect(finalLevels.some((l) => l.onHand > 0)).toBe(true);
  });
});
