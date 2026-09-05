import { afterAll, describe, expect, it } from "vitest";
import { signup } from "@/server/core/signup";
import { withTenant } from "@/lib/db/tenant-client";
import { createProduct } from "@/server/catalog/products";
import { createPartner } from "@/server/core/partners";
import { createSalesOrder, confirmSalesOrder } from "@/server/sales/orders";
import { createStandaloneInvoice, postInvoice } from "@/server/invoicing/invoices";
import { createStandaloneBill, postBill } from "@/server/procurement/bills";
import { createOpportunity } from "@/server/crm/opportunities";
import { getDashboardSummary } from "@/server/reporting/dashboard";
import { getBusinessInsights } from "@/server/reporting/insights";
import { PermissionError, unionPermissions } from "@/lib/auth/permissions";
import type { RequestContext } from "@/server/context";

/**
 * P6+ BI/Reporting acceptance gate: the Overview dashboard and the
 * Business Insights page both reflect REAL rows across Sales, Invoicing,
 * Procurement, CRM and Inventory -- the mock data the Overview page
 * shipped with in Stage 2 is gone -- and the dashboard shows each caller
 * only the sections their own permissions actually cover, never throwing
 * for a role that lacks one.
 */

const hasDatabase =
  Boolean(process.env.DATABASE_URL) && !process.env.DATABASE_URL?.includes("placeholder");
const describeWithDb = hasDatabase ? describe : describe.skip;

async function makeFixture(orgName: string) {
  const result = await signup({
    name: "Test Owner",
    email: `bi-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`,
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

    await tx.company.updateMany({ where: { tenantId: result.tenantId }, data: { region: "Maharashtra" } });

    const uom = await tx.unitOfMeasure.findFirstOrThrow({ where: { tenantId: result.tenantId, code: "pcs" } });
    const warehouse = await tx.warehouse.findFirstOrThrow({ where: { tenantId: result.tenantId } });
    const stockLocation = await tx.location.findFirstOrThrow({ where: { tenantId: result.tenantId, warehouseId: warehouse.id, kind: "internal" } });

    return { ctx, uomId: uom.id, warehouseId: warehouse.id, stockLocationId: stockLocation.id };
  });
}

function product(sku: string, name: string, uomId: string) {
  return {
    sku,
    name,
    type: "goods" as const,
    uomId,
    salesPrice: 100,
    costPrice: 50,
    tracking: "none" as const,
    isSellable: true,
    isPurchasable: true,
    isActive: true,
  };
}

/** createProduct has no reorderPoint setter (a real, separate gap -- not this test's to fix); set it directly for the low-stock fixture. */
async function setReorderPoint(tenantId: string, productId: string, reorderPoint: number) {
  await withTenant(tenantId, (tx) => tx.product.update({ where: { id: productId }, data: { reorderPoint } }));
}

describeWithDb("Business Insights / Overview dashboard", () => {
  const tenantIds: string[] = [];
  afterAll(async () => {
    const { prisma } = await import("@/lib/db/client");
    for (const id of tenantIds) await withTenant(id, (tx) => tx.tenant.delete({ where: { id } }));
    await prisma.$disconnect();
  });

  it("aggregates real rows across Sales, Invoicing, Procurement, CRM and Inventory", async () => {
    const { ctx, uomId, warehouseId } = await makeFixture("BI Co");
    tenantIds.push(ctx.tenantId);

    const customer = await createPartner(ctx, { name: "BI Customer", kind: "company", isCustomer: true, isSupplier: false, paymentTermDays: 0, billingLine1: "1 Test Street", billingRegion: "Maharashtra", billingCountry: "IN" });
    const supplier = await createPartner(ctx, { name: "BI Supplier", kind: "company", isCustomer: false, isSupplier: true, paymentTermDays: 0, billingLine1: "1 Test Street", billingRegion: "Maharashtra", billingCountry: "IN" });
    const item = await createProduct(ctx, product("BI-ITEM", "BI Item", uomId));
    // reorderPoint of 5 with 0 on-hand (never received) makes this low stock.
    await setReorderPoint(ctx.tenantId, item.id, 5);

    // Sales: one confirmed order shows up as "open".
    const orderId = await createSalesOrder(ctx, { partnerId: customer.id, warehouseId, invoicingPolicy: "invoice_ordered", lines: [{ productId: item.id, qtyOrdered: 3, discountPct: 0 }] });
    await confirmSalesOrder(ctx, orderId);

    // Invoicing: a posted invoice this month is both revenue and AR.
    const invoiceId = await createStandaloneInvoice(ctx, { partnerId: customer.id, lines: [{ productId: item.id, quantity: 2, discountPct: 0 }] });
    await postInvoice(ctx, invoiceId);

    // Procurement: a posted bill is AP.
    const billId = await createStandaloneBill(ctx, { partnerId: supplier.id, lines: [{ productId: item.id, quantity: 4, discountPct: 0 }] });
    await postBill(ctx, billId);

    // CRM: one open opportunity contributes to the weighted pipeline.
    await createOpportunity(ctx, { name: "BI Deal", partnerId: customer.id, expectedValue: 10000 });

    const summary = await getDashboardSummary(ctx);

    // Value includes GST (18% intra-state on a 300 subtotal), so it's checked as a floor, not an exact match.
    expect(summary.openSalesOrders?.count).toBe(1);
    expect(summary.openSalesOrders?.value).toBeGreaterThanOrEqual(300);
    expect(summary.invoicedThisMonth).toBeGreaterThanOrEqual(200);
    expect(summary.arOutstanding).toBeGreaterThanOrEqual(200);
    // Bills price against cost (50), not sales price -- 4 units * 50 = 200 subtotal, plus GST.
    expect(summary.apOutstanding).toBeGreaterThanOrEqual(200);
    // "new" stage defaults to 10% probability -> 10000 * 0.10 = 1000.
    expect(summary.pipelineValue).toBeGreaterThanOrEqual(1000);
    expect(summary.lowStockCount).toBeGreaterThanOrEqual(1);
    expect(summary.recentSalesOrders?.some((o) => o.id === orderId)).toBe(true);

    const insights = await getBusinessInsights(ctx);
    const thisMonth = new Date().toISOString().slice(0, 7);
    expect(insights.revenueByMonth.find((m) => m.month === thisMonth)?.revenue).toBeGreaterThanOrEqual(200);
    expect(insights.topCustomers.some((c) => c.partnerId === customer.id)).toBe(true);
    expect(insights.topProducts.some((p) => p.productId === item.id)).toBe(true);
    expect(insights.arTotal).toBeGreaterThanOrEqual(200);
    expect(insights.apTotal).toBeGreaterThanOrEqual(200);
    expect(insights.pipelineWeightedValue).toBeGreaterThanOrEqual(1000);
    expect(insights.pipelineOpenCount).toBeGreaterThanOrEqual(1);
    expect(insights.lowStockItems.some((s) => s.productId === item.id)).toBe(true);
  });

  it("the dashboard shows a caller only the sections their own permissions cover, and never throws for a missing one", async () => {
    const { ctx } = await makeFixture("BI Restricted Co");
    tenantIds.push(ctx.tenantId);

    const restricted: RequestContext = { ...ctx, permissions: new Set(["sales:order:read"]) };
    const summary = await getDashboardSummary(restricted);

    expect(summary.openSalesOrders).not.toBeNull();
    expect(summary.recentSalesOrders).not.toBeNull();
    expect(summary.invoicedThisMonth).toBeNull();
    expect(summary.arOutstanding).toBeNull();
    expect(summary.apOutstanding).toBeNull();
    expect(summary.pipelineValue).toBeNull();
    expect(summary.lowStockCount).toBeNull();
    expect(summary.openPurchaseOrders).toBeNull();
  });

  it("Business Insights requires reporting:insights:read and refuses a caller without it", async () => {
    const { ctx } = await makeFixture("BI Guard Co");
    tenantIds.push(ctx.tenantId);

    const restricted: RequestContext = { ...ctx, permissions: new Set(["sales:order:read", "invoicing:invoice:read"]) };
    await expect(getBusinessInsights(restricted)).rejects.toThrow(PermissionError);
  });

  it("is scoped per tenant -- one tenant's revenue never appears in another's insights", async () => {
    const fixtureA = await makeFixture("BI Isolation A");
    const fixtureB = await makeFixture("BI Isolation B");
    tenantIds.push(fixtureA.ctx.tenantId, fixtureB.ctx.tenantId);

    const customer = await createPartner(fixtureA.ctx, { name: "Iso Customer", kind: "company", isCustomer: true, isSupplier: false, paymentTermDays: 0, billingLine1: "1 Test Street", billingRegion: "Maharashtra", billingCountry: "IN" });
    const item = await createProduct(fixtureA.ctx, product("ISO-BI", "Iso BI Item", fixtureA.uomId));
    const invoiceId = await createStandaloneInvoice(fixtureA.ctx, { partnerId: customer.id, lines: [{ productId: item.id, quantity: 1, discountPct: 0 }] });
    await postInvoice(fixtureA.ctx, invoiceId);

    const insightsB = await getBusinessInsights(fixtureB.ctx);
    expect(insightsB.topCustomers.some((c) => c.partnerId === customer.id)).toBe(false);
    expect(insightsB.arTotal).toBe(0);
  });
});
