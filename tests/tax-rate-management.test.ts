import { afterAll, describe, expect, it } from "vitest";
import { signup } from "@/server/core/signup";
import { withTenant } from "@/lib/db/tenant-client";
import { createPartner } from "@/server/core/partners";
import { createSalesOrder, getSalesOrder } from "@/server/sales/orders";
import { getCompany, updateCompany } from "@/server/core/company";
import { createTaxRate, listTaxRates, deleteTaxRate } from "@/server/core/tax-rates";
import type { RequestContext } from "@/server/context";
import { unionPermissions } from "@/lib/auth/permissions";

/**
 * Proves the fix, not just the CRUD: before this session, orders.ts never
 * passed a tenant's configured TaxRate rows to computeTax() at all, so
 * every US order silently computed zero tax regardless of what a tenant
 * configured. This test creates a US order BEFORE any rate exists (must be
 * zero, with a clear note, never a crash) and AFTER a rate is added (must
 * actually apply it) -- the second case is what was broken.
 */

const hasDatabase =
  Boolean(process.env.DATABASE_URL) && !process.env.DATABASE_URL?.includes("placeholder");
const describeWithDb = hasDatabase ? describe : describe.skip;

async function makeOwnerContext(orgName: string, country: string) {
  const result = await signup({
    name: "Test Owner",
    email: `taxrate-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`,
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
      permissions: unionPermissions(membership.roles.map((r) => r.role)),
      recordScopes: [],
      availableTenants: [],
    };
    const uom = await tx.unitOfMeasure.findFirstOrThrow({ where: { tenantId: result.tenantId, code: "pcs" } });
    const warehouse = await tx.warehouse.findFirstOrThrow({ where: { tenantId: result.tenantId } });
    return { ctx, uomId: uom.id, warehouseId: warehouse.id };
  });
}

describeWithDb("Company profile", () => {
  const tenantIds: string[] = [];
  afterAll(async () => {
    const { prisma } = await import("@/lib/db/client");
    for (const id of tenantIds) await withTenant(id, (tx) => tx.tenant.delete({ where: { id } }));
    await prisma.$disconnect();
  });

  it("starts without a region (isTaxReady false) and becomes ready once one is set", async () => {
    const { ctx } = await makeOwnerContext("Company Profile Co", "IN");
    tenantIds.push(ctx.tenantId);

    const before = await getCompany(ctx);
    expect(before.region).toBeNull();
    expect(before.isTaxReady).toBe(false);

    const after = await updateCompany(ctx, {
      name: before.name,
      region: "Karnataka",
      taxId: "29AAAAA0000A1Z5",
      addressLine1: "1 Tech Park",
      city: "Bengaluru",
      postalCode: "560001",
    });
    expect(after.region).toBe("Karnataka");
    expect(after.isTaxReady).toBe(true);
  });
});

describeWithDb("US sales tax — the actual fix", () => {
  const tenantIds: string[] = [];
  afterAll(async () => {
    const { prisma } = await import("@/lib/db/client");
    for (const id of tenantIds) await withTenant(id, (tx) => tx.tenant.delete({ where: { id } }));
    await prisma.$disconnect();
  });

  it("a US order with no configured rates is zero tax with a clear note, not a crash", async () => {
    const { ctx, uomId, warehouseId } = await makeOwnerContext("US No Rate Co", "US");
    tenantIds.push(ctx.tenantId);

    const partner = await createPartner(ctx, {
      name: "US Customer",
      kind: "company",
      isCustomer: true,
      isSupplier: false,
      paymentTermDays: 30,
      billingLine1: "1 Main St",
      billingCity: "Austin",
      billingRegion: "Texas",
      billingCountry: "US",
    });
    const productId = await withTenant(ctx.tenantId, async (tx) => {
      const p = await tx.product.create({ data: { tenantId: ctx.tenantId, sku: `US-${Date.now()}`, name: "US Widget", uomId, salesPrice: 100 } });
      return p.id;
    });

    const orderId = await createSalesOrder(ctx, {
      partnerId: partner.id,
      warehouseId,
      invoicingPolicy: "invoice_delivered",
      lines: [{ productId, qtyOrdered: 1, discountPct: 0 }],
    });
    const order = await getSalesOrder(ctx, orderId);

    expect(order!.taxTotal).toBe(0);
    expect(order!.total).toBe(order!.subtotal);
  });

  it("configuring a jurisdiction rate makes it actually apply to a new order", async () => {
    const { ctx, uomId, warehouseId } = await makeOwnerContext("US Rate Co", "US");
    tenantIds.push(ctx.tenantId);

    // Texas: 6.25% state + 2% city, stacked -- how US sales tax actually works.
    await createTaxRate(ctx, { name: "Texas state", country: "US", region: "Texas", rate: 6.25, level: "state", isActive: true });
    await createTaxRate(ctx, { name: "Austin city", country: "US", region: "Austin", rate: 2, level: "city", isActive: true });

    const rates = await listTaxRates(ctx);
    expect(rates).toHaveLength(2);

    const partner = await createPartner(ctx, {
      name: "Texas Customer",
      kind: "company",
      isCustomer: true,
      isSupplier: false,
      paymentTermDays: 30,
      billingLine1: "1 Main St",
      billingCity: "Austin",
      billingRegion: "Texas",
      billingCountry: "US",
    });
    const productId = await withTenant(ctx.tenantId, async (tx) => {
      const p = await tx.product.create({ data: { tenantId: ctx.tenantId, sku: `TX-${Date.now()}`, name: "Texas Widget", uomId, salesPrice: 100 } });
      return p.id;
    });

    const orderId = await createSalesOrder(ctx, {
      partnerId: partner.id,
      warehouseId,
      invoicingPolicy: "invoice_delivered",
      lines: [{ productId, qtyOrdered: 1, discountPct: 0 }],
    });
    const order = await getSalesOrder(ctx, orderId);

    // This is the exact case that was broken: before wiring settings.rates
    // through, this would have been 0 regardless of what was configured.
    expect(order!.taxTotal).toBe(8.25); // 6.25 + 2 on a $100 line
    expect(order!.total).toBe(108.25);
    const labels = order!.taxComponents.map((c) => c.label);
    expect(labels.some((l) => l.includes("Texas state"))).toBe(true);
    expect(labels.some((l) => l.includes("Austin city"))).toBe(true);
  });

  it("tax rates can be updated and deleted", async () => {
    const { ctx } = await makeOwnerContext("US Rate CRUD Co", "US");
    tenantIds.push(ctx.tenantId);

    const rate = await createTaxRate(ctx, { name: "California", country: "US", region: "California", rate: 7.25, level: "state", isActive: true });
    expect(rate.rate).toBe(7.25);

    await deleteTaxRate(ctx, rate.id);
    const remaining = await listTaxRates(ctx);
    expect(remaining.find((r) => r.id === rate.id)).toBeUndefined();
  });
});
