import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { signup } from "@/server/core/signup";
import { withTenant } from "@/lib/db/tenant-client";
import { createPartner } from "@/server/core/partners";
import { receiveStock } from "@/server/inventory/stock";
import { createSalesOrder, confirmSalesOrder, createDelivery, getSalesOrder } from "@/server/sales/orders";
import { createStandaloneBill, postBill } from "@/server/procurement/bills";
import { createBom } from "@/server/manufacturing/boms";
import { createWorkOrder, confirmWorkOrder, completeWorkOrder } from "@/server/manufacturing/work-orders";
import { registerGLSubscriber } from "@/server/accounting/gl-subscriber";
import { listAccounts } from "@/server/accounting/accounts";
import { listJournalEntries, getJournalEntry } from "@/server/accounting/journal-entries";
import { getTrialBalance } from "@/server/accounting/reports";
import type { RequestContext } from "@/server/context";
import { unionPermissions } from "@/lib/auth/permissions";

/**
 * The stock-move-events acceptance gate: closes the "P2 stock moves don't
 * emit domain events" gap every P6+ module's own scope notes named as
 * future work. A delivery (a sale shipping) now posts Dr Cost of Goods
 * Sold / Cr Inventory Asset at the exact AVCO cost the move was valued at
 * -- something NOTHING posted before this fix, since invoice.posted only
 * ever recognised revenue. Procurement's bill.posted was updated in the
 * same pass to debit Inventory Asset instead of Cost of Goods Sold
 * directly (see tests/procurement.test.ts for that half). A receipt and a
 * manufacturing work order's consumption/production moves deliberately
 * post nothing, by design -- verified here too, not just asserted in a
 * comment.
 */

const hasDatabase =
  Boolean(process.env.DATABASE_URL) && !process.env.DATABASE_URL?.includes("placeholder");
const describeWithDb = hasDatabase ? describe : describe.skip;

async function waitFor<T>(fn: () => Promise<T | null | undefined>, timeoutMs = 15000): Promise<T> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const result = await fn();
    if (result) return result;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`waitFor timed out after ${timeoutMs}ms`);
}

async function makeFixture(orgName: string) {
  const result = await signup({
    name: "Test Owner",
    email: `stockgl-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`,
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
    await tx.company.updateMany({ where: { tenantId: result.tenantId }, data: { region: "Maharashtra" } });

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

function goods(sku: string, uomId: string) {
  return { sku, name: "GL Test Item", type: "goods" as const, uomId, salesPrice: 200, costPrice: 0, tracking: "none" as const, isSellable: true, isPurchasable: true, isActive: true };
}

async function makeProduct(tenantId: string, uomId: string, sku: string) {
  return withTenant(tenantId, (tx) => tx.product.create({ data: { tenantId, ...goods(sku, uomId) } })).then((p) => p.id);
}

describeWithDb("Stock-move domain events → GL", () => {
  beforeAll(() => {
    registerGLSubscriber();
  });

  const tenantIds: string[] = [];
  afterAll(async () => {
    const { prisma } = await import("@/lib/db/client");
    for (const id of tenantIds) await withTenant(id, (tx) => tx.tenant.delete({ where: { id } }));
    await prisma.$disconnect();
  });

  it("a receipt posts no GL entry by itself, but a delivery posts Dr Cost of Goods Sold / Cr Inventory Asset at the exact AVCO cost", async () => {
    const { ctx, uomId, warehouseId, stockLocationId } = await makeFixture("Stock GL Co");
    tenantIds.push(ctx.tenantId);

    const productId = await makeProduct(ctx.tenantId, uomId, "STOCKGL-01");
    const customer = await createPartner(ctx, { name: "Stock GL Customer", kind: "company", isCustomer: true, isSupplier: false, paymentTermDays: 0, billingLine1: "1 Test Street", billingRegion: "Maharashtra", billingCountry: "IN" });

    // Receive 10 units @ 20 -- AVCO cost is now exactly 20/unit.
    await receiveStock(ctx, { productId, toLocationId: stockLocationId, quantity: 10, unitCost: 20 });

    // No journal entry should exist yet -- a receipt alone is not a GL event.
    const afterReceipt = await listJournalEntries(ctx, { page: 1, pageSize: 50, filters: [], sort: [] });
    expect(afterReceipt.rows.find((r) => r.sourceType === "StockMove")).toBeUndefined();

    const orderId = await createSalesOrder(ctx, { partnerId: customer.id, warehouseId, invoicingPolicy: "invoice_delivered", lines: [{ productId, qtyOrdered: 4, discountPct: 0 }] });
    await confirmSalesOrder(ctx, orderId);
    const order = await getSalesOrder(ctx, orderId);
    await createDelivery(ctx, orderId, { lines: [{ salesOrderLineId: order!.lines[0].id, quantity: 4 }] });

    const entry = await waitFor(async () => {
      const page = await listJournalEntries(ctx, { page: 1, pageSize: 50, filters: [], sort: [] });
      const match = page.rows.find((r) => r.sourceType === "StockMove");
      return match ? getJournalEntry(ctx, match.id) : null;
    });

    expect(entry!.totalDebit).toBe(entry!.totalCredit);
    expect(entry!.totalDebit).toBe(80); // 4 units * 20 AVCO cost

    const accounts = await listAccounts(ctx);
    const cogsId = accounts.find((a) => a.systemKey === "cost_of_goods_sold")!.id;
    const inventoryAssetId = accounts.find((a) => a.systemKey === "inventory_asset")!.id;
    expect(entry!.lines.find((l) => l.accountId === cogsId)!.debit).toBe(80);
    expect(entry!.lines.find((l) => l.accountId === inventoryAssetId)!.credit).toBe(80);
  });

  it("a purchase (bill) and a later sale (delivery) net correctly in the same Inventory Asset account", async () => {
    const { ctx, uomId, warehouseId, stockLocationId } = await makeFixture("Stock GL Net Co");
    tenantIds.push(ctx.tenantId);

    const productId = await makeProduct(ctx.tenantId, uomId, "STOCKGL-02");
    const supplier = await createPartner(ctx, { name: "Stock GL Supplier", kind: "company", isCustomer: false, isSupplier: true, paymentTermDays: 30, billingLine1: "1 Supplier Street", billingRegion: "Maharashtra", billingCountry: "IN" });
    const customer = await createPartner(ctx, { name: "Stock GL Net Customer", kind: "company", isCustomer: true, isSupplier: false, paymentTermDays: 0, billingLine1: "1 Test Street", billingRegion: "Maharashtra", billingCountry: "IN" });

    await receiveStock(ctx, { productId, toLocationId: stockLocationId, quantity: 10, unitCost: 20 });

    const billId = await createStandaloneBill(ctx, { partnerId: supplier.id, lines: [{ productId, quantity: 10, unitCost: 20, discountPct: 0 }] });
    await postBill(ctx, billId);

    await waitFor(async () => {
      const page = await listJournalEntries(ctx, { page: 1, pageSize: 50, filters: [], sort: [] });
      return page.rows.find((r) => r.sourceType === "Bill") ?? null;
    });

    const orderId = await createSalesOrder(ctx, { partnerId: customer.id, warehouseId, invoicingPolicy: "invoice_delivered", lines: [{ productId, qtyOrdered: 4, discountPct: 0 }] });
    await confirmSalesOrder(ctx, orderId);
    const order = await getSalesOrder(ctx, orderId);
    await createDelivery(ctx, orderId, { lines: [{ salesOrderLineId: order!.lines[0].id, quantity: 4 }] });

    await waitFor(async () => {
      const page = await listJournalEntries(ctx, { page: 1, pageSize: 50, filters: [], sort: [] });
      return page.rows.find((r) => r.sourceType === "StockMove") ?? null;
    });

    const trialBalance = await getTrialBalance(ctx);
    const inventoryRow = trialBalance.rows.find((r) => r.code === "1200");
    const cogsRow = trialBalance.rows.find((r) => r.code === "5000");

    // Bill: Dr Inventory Asset 200 (10 units * cost 20). Delivery: Cr Inventory Asset 80 (4 units * AVCO 20). Net debit = 120.
    expect(inventoryRow!.debit).toBe(120);
    expect(inventoryRow!.credit).toBe(0);
    expect(cogsRow!.debit).toBe(80);
    expect(trialBalance.balanced).toBe(true);
  });

  it("completing a manufacturing work order posts no journal entry -- consumption and production net to zero by construction", async () => {
    const { ctx, uomId, warehouseId, stockLocationId } = await makeFixture("Stock GL Mfg Co");
    tenantIds.push(ctx.tenantId);

    const componentId = await makeProduct(ctx.tenantId, uomId, "STOCKGL-COMP");
    const outputId = await makeProduct(ctx.tenantId, uomId, "STOCKGL-OUT");
    await receiveStock(ctx, { productId: componentId, toLocationId: stockLocationId, quantity: 20, unitCost: 15 });

    const bomId = await createBom(ctx, { productId: outputId, quantity: 1, isActive: true, lines: [{ componentProductId: componentId, quantity: 2 }] });
    const workOrderId = await createWorkOrder(ctx, { bomId, warehouseId, quantity: 5 });
    await confirmWorkOrder(ctx, workOrderId);
    await completeWorkOrder(ctx, workOrderId);

    // Give any (incorrect) async posting a moment to land before asserting absence.
    await new Promise((resolve) => setTimeout(resolve, 1000));

    const page = await listJournalEntries(ctx, { page: 1, pageSize: 50, filters: [], sort: [] });
    expect(page.rows.find((r) => r.sourceType === "StockMove")).toBeUndefined();
  });
});
