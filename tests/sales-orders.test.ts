import { afterAll, describe, expect, it } from "vitest";
import { signup } from "@/server/core/signup";
import { withTenant } from "@/lib/db/tenant-client";
import { createPartner } from "@/server/core/partners";
import { receiveStock, getStockLevels } from "@/server/inventory/stock";
import {
  createSalesOrder,
  confirmSalesOrder,
  cancelSalesOrder,
  createDelivery,
  getSalesOrder,
} from "@/server/sales/orders";
import type { RequestContext } from "@/server/context";
import { unionPermissions } from "@/lib/auth/permissions";

/**
 * THE P3 ACCEPTANCE GATE (docs/roadmap.md §P3):
 *
 *   "quote -> order -> delivery visibly reduces on-hand in Inventory, a
 *    partial delivery leaves the order in partially_delivered with the
 *    remainder still tracked, and the header status is provably derived
 *    from line quantities rather than stored."
 *
 * Every status assertion here is checked against what getSalesOrder()
 * RETURNS after a mutation, which is itself recomputed by recomputeOrder()
 * from the line quantities on every call -- there is no code path that sets
 * `status` directly except confirm/cancel, exactly the two facts
 * derivation cannot see on its own.
 */

const hasDatabase =
  Boolean(process.env.DATABASE_URL) && !process.env.DATABASE_URL?.includes("placeholder");
const describeWithDb = hasDatabase ? describe : describe.skip;

async function makeOwnerContext(orgName: string, country = "IN") {
  const result = await signup({
    name: "Test Owner",
    email: `salesorder-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`,
    password: "password123",
    organisation: orgName,
    country,
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

    // A real company must know its own filing state before it can compute
    // GST correctly (place of supply depends on it) -- the P1 tax engine
    // throws rather than guess, on purpose. Onboarding a real tenant would
    // collect this in Settings; the test fixture sets it here for the same
    // reason a real company would have to before issuing its first invoice.
    await tx.company.updateMany({ where: { tenantId: result.tenantId }, data: { region: "Maharashtra" } });

    const uom = await tx.unitOfMeasure.findFirstOrThrow({ where: { tenantId: result.tenantId, code: "pcs" } });
    const taxCat = await tx.taxCategory.findFirstOrThrow({ where: { tenantId: result.tenantId, key: "standard" } });
    const warehouse = await tx.warehouse.findFirstOrThrow({ where: { tenantId: result.tenantId } });
    const stockLocation = await tx.location.findFirstOrThrow({
      where: { tenantId: result.tenantId, warehouseId: warehouse.id, kind: "internal" },
    });

    return { ctx, uomId: uom.id, taxCategoryId: taxCat.id, warehouseId: warehouse.id, stockLocationId: stockLocation.id };
  });
}

describeWithDb("Sales orders — the P3 acceptance gate", () => {
  const tenantIds: string[] = [];
  afterAll(async () => {
    const { prisma } = await import("@/lib/db/client");
    for (const id of tenantIds) await withTenant(id, (tx) => tx.tenant.delete({ where: { id } }));
    await prisma.$disconnect();
  });

  it("a new order is draft, and status is derived (not a settable field) from the very start", async () => {
    const { ctx, uomId, taxCategoryId, warehouseId } = await makeOwnerContext("Draft Co");
    tenantIds.push(ctx.tenantId);

    const partner = await createPartner(ctx, { name: "Test Customer", kind: "company", isCustomer: true, isSupplier: false, paymentTermDays: 30, billingLine1: "1 Test Street", billingRegion: "Maharashtra", billingCountry: "IN" });
    const productId = await withTenant(ctx.tenantId, async (tx) => {
      const p = await tx.product.create({ data: { tenantId: ctx.tenantId, sku: `SO-${Date.now()}`, name: "Ordered Widget", uomId, taxCategoryId, salesPrice: 100 } });
      return p.id;
    });

    const orderId = await createSalesOrder(ctx, {
      partnerId: partner.id,
      warehouseId,
      invoicingPolicy: "invoice_delivered",
      lines: [{ productId, qtyOrdered: 10, discountPct: 0 }],
    });

    const order = await getSalesOrder(ctx, orderId);
    expect(order!.status).toBe("draft");
    expect(order!.lines[0].qtyOrdered).toBe(10);
    expect(order!.lines[0].qtyDelivered).toBe(0);
    expect(order!.subtotal).toBe(1000);
  });

  it("confirming moves draft -> confirmed WITHOUT touching stock", async () => {
    const { ctx, uomId, taxCategoryId, warehouseId, stockLocationId } = await makeOwnerContext("Confirm Co");
    tenantIds.push(ctx.tenantId);

    const partner = await createPartner(ctx, { name: "Confirm Customer", kind: "company", isCustomer: true, isSupplier: false, paymentTermDays: 30, billingLine1: "1 Test Street", billingRegion: "Maharashtra", billingCountry: "IN" });
    const productId = await withTenant(ctx.tenantId, async (tx) => {
      const p = await tx.product.create({ data: { tenantId: ctx.tenantId, sku: `SO-CONF-${Date.now()}`, name: "Confirm Widget", uomId, taxCategoryId, salesPrice: 50 } });
      return p.id;
    });
    await receiveStock(ctx, { productId, toLocationId: stockLocationId, quantity: 100, unitCost: 20 });

    const orderId = await createSalesOrder(ctx, {
      partnerId: partner.id,
      warehouseId,
      invoicingPolicy: "invoice_delivered",
      lines: [{ productId, qtyOrdered: 5, discountPct: 0 }],
    });

    const before = (await getStockLevels(ctx)).find((l) => l.productId === productId);
    await confirmSalesOrder(ctx, orderId);
    const after = (await getStockLevels(ctx)).find((l) => l.productId === productId);

    const order = await getSalesOrder(ctx, orderId);
    expect(order!.status).toBe("confirmed");
    // Confirming commits the order; it does not move stock. On-hand is
    // untouched until an actual delivery ships (this file's next test).
    expect(after!.onHand).toBe(before!.onHand);
  });

  it("a delivery visibly reduces on-hand in Inventory, and a partial one leaves the order partially_delivered", async () => {
    const { ctx, uomId, taxCategoryId, warehouseId, stockLocationId } = await makeOwnerContext("Delivery Flow Co");
    tenantIds.push(ctx.tenantId);

    const partner = await createPartner(ctx, { name: "Delivery Customer", kind: "company", isCustomer: true, isSupplier: false, paymentTermDays: 30, billingLine1: "1 Test Street", billingRegion: "Maharashtra", billingCountry: "IN" });
    const productId = await withTenant(ctx.tenantId, async (tx) => {
      const p = await tx.product.create({ data: { tenantId: ctx.tenantId, sku: `SO-DEL-${Date.now()}`, name: "Delivery Widget", uomId, taxCategoryId, salesPrice: 40 } });
      return p.id;
    });
    await receiveStock(ctx, { productId, toLocationId: stockLocationId, quantity: 100, unitCost: 15 });

    const orderId = await createSalesOrder(ctx, {
      partnerId: partner.id,
      warehouseId,
      invoicingPolicy: "invoice_delivered",
      lines: [{ productId, qtyOrdered: 20, discountPct: 0 }],
    });
    await confirmSalesOrder(ctx, orderId);

    const order = await getSalesOrder(ctx, orderId);
    const lineId = order!.lines[0].id;

    // Ship only 8 of the 20 ordered -- a partial delivery.
    await createDelivery(ctx, orderId, { lines: [{ salesOrderLineId: lineId, quantity: 8 }] });

    const afterPartial = await getSalesOrder(ctx, orderId);
    expect(afterPartial!.status).toBe("partially_delivered");
    expect(afterPartial!.lines[0].qtyDelivered).toBe(8);
    expect(afterPartial!.deliveredQty).toBe(8);
    expect(afterPartial!.orderedQty).toBe(20);

    const levels = (await getStockLevels(ctx)).find((l) => l.productId === productId);
    expect(levels!.onHand).toBe(92); // 100 received - 8 delivered

    // Ship the remaining 12 -- the order should now read fully delivered.
    await createDelivery(ctx, orderId, { lines: [{ salesOrderLineId: lineId, quantity: 12 }] });

    const afterFull = await getSalesOrder(ctx, orderId);
    expect(afterFull!.status).toBe("delivered");
    expect(afterFull!.lines[0].qtyDelivered).toBe(20);

    const finalLevels = (await getStockLevels(ctx)).find((l) => l.productId === productId);
    expect(finalLevels!.onHand).toBe(80); // 100 - 20
  });

  it("cannot deliver more than remains on the order line", async () => {
    const { ctx, uomId, taxCategoryId, warehouseId, stockLocationId } = await makeOwnerContext("Overdeliver Co");
    tenantIds.push(ctx.tenantId);

    const partner = await createPartner(ctx, { name: "Overdeliver Customer", kind: "company", isCustomer: true, isSupplier: false, paymentTermDays: 30, billingLine1: "1 Test Street", billingRegion: "Maharashtra", billingCountry: "IN" });
    const productId = await withTenant(ctx.tenantId, async (tx) => {
      const p = await tx.product.create({ data: { tenantId: ctx.tenantId, sku: `SO-OVER-${Date.now()}`, name: "Overdeliver Widget", uomId, taxCategoryId, salesPrice: 10 } });
      return p.id;
    });
    await receiveStock(ctx, { productId, toLocationId: stockLocationId, quantity: 100, unitCost: 5 });

    const orderId = await createSalesOrder(ctx, { partnerId: partner.id, warehouseId, invoicingPolicy: "invoice_delivered", lines: [{ productId, qtyOrdered: 5, discountPct: 0 }] });
    await confirmSalesOrder(ctx, orderId);
    const order = await getSalesOrder(ctx, orderId);

    await expect(
      createDelivery(ctx, orderId, { lines: [{ salesOrderLineId: order!.lines[0].id, quantity: 6 }] })
    ).rejects.toThrow(/only 5 remain/);
  });

  it("India: an intra-state order splits tax into CGST + SGST on the order itself", async () => {
    const { ctx, uomId, taxCategoryId, warehouseId } = await makeOwnerContext("GST Co", "IN");
    tenantIds.push(ctx.tenantId);

    // Same state for seller (Company, default Maharashtra-less country-only
    // in bootstrap) and buyer -- explicitly set both to Maharashtra so this
    // is unambiguously an intra-state supply.
    await withTenant(ctx.tenantId, (tx) =>
      tx.company.updateMany({ where: { tenantId: ctx.tenantId }, data: { region: "Maharashtra", taxId: "27AAAAA0000A1Z5" } })
    );
    const partner = await createPartner(ctx, {
      name: "GST Customer",
      kind: "company",
      isCustomer: true,
      isSupplier: false,
      paymentTermDays: 30,
      billingLine1: "1 Test Street",
      billingRegion: "Maharashtra",
      billingCountry: "IN",
      taxId: "27BBBBB1111B1Z5",
      taxIdCountry: "IN",
    });
    const productId = await withTenant(ctx.tenantId, async (tx) => {
      const p = await tx.product.create({ data: { tenantId: ctx.tenantId, sku: `SO-GST-${Date.now()}`, name: "GST Widget", uomId, taxCategoryId, salesPrice: 100 } });
      return p.id;
    });

    const orderId = await createSalesOrder(ctx, { partnerId: partner.id, warehouseId, invoicingPolicy: "invoice_delivered", lines: [{ productId, qtyOrdered: 1, discountPct: 0 }] });
    const order = await getSalesOrder(ctx, orderId);

    const labels = order!.taxComponents.map((c) => c.label);
    expect(labels.some((l) => l.includes("CGST"))).toBe(true);
    expect(labels.some((l) => l.includes("SGST"))).toBe(true);
    expect(order!.taxTotal).toBeGreaterThan(0);
    // Line-level tax must sum to the order-level tax total exactly.
    const lineTaxSum = order!.lines.reduce((sum, l) => sum + l.taxAmount, 0);
    expect(Math.round(lineTaxSum * 100) / 100).toBe(order!.taxTotal);
  });

  it("cancelling a draft or confirmed order (with nothing delivered) works; cancelling after delivery is refused", async () => {
    const { ctx, uomId, taxCategoryId, warehouseId, stockLocationId } = await makeOwnerContext("Cancel Co");
    tenantIds.push(ctx.tenantId);

    const partner = await createPartner(ctx, { name: "Cancel Customer", kind: "company", isCustomer: true, isSupplier: false, paymentTermDays: 30, billingLine1: "1 Test Street", billingRegion: "Maharashtra", billingCountry: "IN" });
    const productId = await withTenant(ctx.tenantId, async (tx) => {
      const p = await tx.product.create({ data: { tenantId: ctx.tenantId, sku: `SO-CANCEL-${Date.now()}`, name: "Cancel Widget", uomId, taxCategoryId, salesPrice: 10 } });
      return p.id;
    });
    await receiveStock(ctx, { productId, toLocationId: stockLocationId, quantity: 50, unitCost: 5 });

    const orderId = await createSalesOrder(ctx, { partnerId: partner.id, warehouseId, invoicingPolicy: "invoice_delivered", lines: [{ productId, qtyOrdered: 5, discountPct: 0 }] });
    await confirmSalesOrder(ctx, orderId);
    await cancelSalesOrder(ctx, orderId);
    expect((await getSalesOrder(ctx, orderId))!.status).toBe("cancelled");

    const orderId2 = await createSalesOrder(ctx, { partnerId: partner.id, warehouseId, invoicingPolicy: "invoice_delivered", lines: [{ productId, qtyOrdered: 5, discountPct: 0 }] });
    await confirmSalesOrder(ctx, orderId2);
    const order2 = await getSalesOrder(ctx, orderId2);
    await createDelivery(ctx, orderId2, { lines: [{ salesOrderLineId: order2!.lines[0].id, quantity: 2 }] });

    await expect(cancelSalesOrder(ctx, orderId2)).rejects.toThrow(/delivery already recorded/);
  });
});
