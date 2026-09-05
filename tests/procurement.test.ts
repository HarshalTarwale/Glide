import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { signup } from "@/server/core/signup";
import { withTenant } from "@/lib/db/tenant-client";
import { createPartner } from "@/server/core/partners";
import { getStockLevels } from "@/server/inventory/stock";
import {
  createPurchaseOrder,
  confirmPurchaseOrder,
  cancelPurchaseOrder,
  createReceipt,
  getPurchaseOrder,
} from "@/server/procurement/orders";
import {
  createBillFromOrder,
  createStandaloneBill,
  updateBillLines,
  postBill,
  cancelBill,
  getBill,
} from "@/server/procurement/bills";
import { recordBillPayment, getBillPayment } from "@/server/procurement/bill-payments";
import { getApAgingReport } from "@/server/procurement/ap-aging";
import { registerGLSubscriber } from "@/server/accounting/gl-subscriber";
import { listAccounts } from "@/server/accounting/accounts";
import { listJournalEntries, getJournalEntry } from "@/server/accounting/journal-entries";
import type { RequestContext } from "@/server/context";
import { unionPermissions } from "@/lib/auth/permissions";

/**
 * THE PROCUREMENT ACCEPTANCE GATE, confirmed with the user 2026-09-05:
 * order -> receipt -> bill -> payment mirrors Sales+Invoicing exactly,
 * receiving visibly raises on-hand in Inventory, a posted bill is
 * immutable, posting a bill / recording a bill payment auto-posts to the
 * ledger via the SAME P4 domain event bus GL already subscribes to
 * (without orders.ts/bills.ts/bill-payments.ts knowing GL exists), and AP
 * aging reconciles.
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

async function makeOwnerContext(orgName: string, country = "IN") {
  const result = await signup({
    name: "Test Owner",
    email: `procurement-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`,
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
    const taxCat = await tx.taxCategory.findFirstOrThrow({ where: { tenantId: result.tenantId, key: "standard" } });
    const warehouse = await tx.warehouse.findFirstOrThrow({ where: { tenantId: result.tenantId } });
    return { ctx, uomId: uom.id, taxCategoryId: taxCat.id, warehouseId: warehouse.id };
  });
}

async function makeSupplier(ctx: RequestContext, name: string) {
  return createPartner(ctx, {
    name,
    kind: "company",
    isCustomer: false,
    isSupplier: true,
    paymentTermDays: 30,
    billingLine1: "1 Supplier Street",
    billingRegion: "Maharashtra",
    billingCountry: "IN",
  });
}

async function makeProduct(ctx: RequestContext, uomId: string, taxCategoryId: string, cost: number) {
  return withTenant(ctx.tenantId, async (tx) => {
    const p = await tx.product.create({
      data: { tenantId: ctx.tenantId, sku: `PO-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, name: "Procured Widget", uomId, taxCategoryId, costPrice: cost },
    });
    return p.id;
  });
}

describeWithDb("Procurement — the P6+ acceptance gate", () => {
  beforeAll(() => {
    registerGLSubscriber();
  });

  const tenantIds: string[] = [];
  afterAll(async () => {
    const { prisma } = await import("@/lib/db/client");
    for (const id of tenantIds) await withTenant(id, (tx) => tx.tenant.delete({ where: { id } }));
    await prisma.$disconnect();
  });

  it("order -> receipt visibly raises on-hand -> bill from order -> post -> payment, with statuses derived at every step", async () => {
    const { ctx, uomId, taxCategoryId, warehouseId } = await makeOwnerContext("PO Lifecycle Co");
    tenantIds.push(ctx.tenantId);

    const supplier = await makeSupplier(ctx, "Lifecycle Supplier");
    const productId = await makeProduct(ctx, uomId, taxCategoryId, 40);

    const orderId = await createPurchaseOrder(ctx, {
      partnerId: supplier.id,
      warehouseId,
      billingPolicy: "bill_received",
      lines: [{ productId, qtyOrdered: 100, discountPct: 0 }],
    });
    const draft = await getPurchaseOrder(ctx, orderId);
    expect(draft!.status).toBe("draft");
    expect(draft!.subtotal).toBe(4000);

    await confirmPurchaseOrder(ctx, orderId);
    const confirmed = await getPurchaseOrder(ctx, orderId);
    expect(confirmed!.status).toBe("confirmed");
    const lineId = confirmed!.lines[0].id;

    const before = (await getStockLevels(ctx)).find((l) => l.productId === productId);

    await createReceipt(ctx, orderId, { lines: [{ purchaseOrderLineId: lineId, quantity: 60 }] });
    const afterPartial = await getPurchaseOrder(ctx, orderId);
    expect(afterPartial!.status).toBe("partially_received");
    expect(afterPartial!.lines[0].qtyReceived).toBe(60);

    const afterReceipt = (await getStockLevels(ctx)).find((l) => l.productId === productId);
    expect(afterReceipt!.onHand).toBe((before?.onHand ?? 0) + 60);

    await createReceipt(ctx, orderId, { lines: [{ purchaseOrderLineId: lineId, quantity: 40 }] });
    const afterFull = await getPurchaseOrder(ctx, orderId);
    expect(afterFull!.status).toBe("received");
    expect(afterFull!.lines[0].qtyReceived).toBe(100);

    const billId = await createBillFromOrder(ctx, orderId, { lines: [{ purchaseOrderLineId: lineId, quantity: 100 }] });
    const draftBill = await getBill(ctx, billId);
    expect(draftBill!.status).toBe("draft");
    expect(draftBill!.subtotal).toBe(4000);
    expect(draftBill!.purchaseOrderId).toBe(orderId);

    const orderAfterBill = await getPurchaseOrder(ctx, orderId);
    expect(orderAfterBill!.status).toBe("billed");
    expect(orderAfterBill!.lines[0].qtyBilled).toBe(100);

    await postBill(ctx, billId);
    const posted = await getBill(ctx, billId);
    expect(posted!.status).toBe("posted");
    expect(posted!.postedAt).not.toBeNull();

    const paymentId = await recordBillPayment(ctx, {
      partnerId: supplier.id,
      amount: posted!.total,
      method: "bank_transfer",
      allocations: [{ billId, amount: posted!.total }],
    });
    const payment = await getBillPayment(ctx, paymentId);
    expect(payment!.unallocatedAmount).toBe(0);

    const paid = await getBill(ctx, billId);
    expect(paid!.status).toBe("paid");
    expect(paid!.outstanding).toBe(0);
  }, 120_000);

  it("cannot receive more than remains on the order line, and cannot cancel an order once anything has been received", async () => {
    const { ctx, uomId, taxCategoryId, warehouseId } = await makeOwnerContext("PO Guard Co");
    tenantIds.push(ctx.tenantId);

    const supplier = await makeSupplier(ctx, "Guard Supplier");
    const productId = await makeProduct(ctx, uomId, taxCategoryId, 10);

    const orderId = await createPurchaseOrder(ctx, { partnerId: supplier.id, warehouseId, billingPolicy: "bill_received", lines: [{ productId, qtyOrdered: 5, discountPct: 0 }] });
    await confirmPurchaseOrder(ctx, orderId);
    const order = await getPurchaseOrder(ctx, orderId);

    await expect(createReceipt(ctx, orderId, { lines: [{ purchaseOrderLineId: order!.lines[0].id, quantity: 6 }] })).rejects.toThrow(/only 5 remain/);

    await createReceipt(ctx, orderId, { lines: [{ purchaseOrderLineId: order!.lines[0].id, quantity: 2 }] });
    await expect(cancelPurchaseOrder(ctx, orderId)).rejects.toThrow(/receipt already recorded/);
  });

  it("a posted bill is immutable, and cannot be cancelled -- only a draft can", async () => {
    const { ctx, uomId, taxCategoryId } = await makeOwnerContext("Bill Immutable Co");
    tenantIds.push(ctx.tenantId);

    const supplier = await makeSupplier(ctx, "Immutable Supplier");
    const productId = await makeProduct(ctx, uomId, taxCategoryId, 200);

    const billId = await createStandaloneBill(ctx, { partnerId: supplier.id, lines: [{ productId, quantity: 2, discountPct: 0 }] });
    await postBill(ctx, billId);

    await expect(updateBillLines(ctx, billId, { lines: [{ productId, quantity: 5, discountPct: 0 }] })).rejects.toThrow(/immutable/);
    await expect(postBill(ctx, billId)).rejects.toThrow(/Only a draft bill can be posted/);
    await expect(cancelBill(ctx, billId)).rejects.toThrow(/cannot be cancelled/);
  });

  it("posting a bill auto-posts Dr Inventory Asset + Tax Payable / Cr Accounts Payable via the domain event bus, without bills.ts knowing GL exists", async () => {
    const { ctx, uomId, taxCategoryId } = await makeOwnerContext("GL Bill Co");
    tenantIds.push(ctx.tenantId);

    const supplier = await makeSupplier(ctx, "GL Supplier");
    const productId = await makeProduct(ctx, uomId, taxCategoryId, 1000);

    const billId = await createStandaloneBill(ctx, { partnerId: supplier.id, lines: [{ productId, quantity: 1, discountPct: 0 }] });
    await postBill(ctx, billId);
    const bill = await getBill(ctx, billId);

    const entry = await waitFor(async () => {
      const page = await listJournalEntries(ctx, { page: 1, pageSize: 50, filters: [], sort: [] });
      const match = page.rows.find((r) => r.sourceType === "Bill");
      return match ? getJournalEntry(ctx, match.id) : null;
    });

    expect(entry!.totalDebit).toBe(entry!.totalCredit);
    expect(entry!.totalCredit).toBe(bill!.total);

    const accounts = await listAccounts(ctx);
    const inventoryAssetId = accounts.find((a) => a.systemKey === "inventory_asset")!.id;
    const apId = accounts.find((a) => a.systemKey === "accounts_payable")!.id;
    expect(entry!.lines.find((l) => l.accountId === inventoryAssetId)!.debit).toBe(bill!.subtotal);
    expect(entry!.lines.find((l) => l.accountId === apId)!.credit).toBe(bill!.total);

    if (bill!.taxTotal > 0) {
      const taxId = accounts.find((a) => a.systemKey === "tax_payable")!.id;
      expect(entry!.lines.find((l) => l.accountId === taxId)!.debit).toBe(bill!.taxTotal);
    }

    const paymentId = await recordBillPayment(ctx, { partnerId: supplier.id, amount: bill!.total, method: "bank_transfer", allocations: [{ billId, amount: bill!.total }] });
    void paymentId;

    const paymentEntry = await waitFor(async () => {
      const page = await listJournalEntries(ctx, { page: 1, pageSize: 50, filters: [], sort: [] });
      const match = page.rows.find((r) => r.sourceType === "BillPayment");
      return match ? getJournalEntry(ctx, match.id) : null;
    });
    const cashId = accounts.find((a) => a.systemKey === "cash")!.id;
    expect(paymentEntry!.lines.find((l) => l.accountId === apId)!.debit).toBe(bill!.total);
    expect(paymentEntry!.lines.find((l) => l.accountId === cashId)!.credit).toBe(bill!.total);
  }, 60_000);

  it("AP aging buckets an overdue bill correctly and reconciles to the outstanding total", async () => {
    const { ctx, uomId, taxCategoryId } = await makeOwnerContext("AP Aging Co");
    tenantIds.push(ctx.tenantId);

    const supplier = await makeSupplier(ctx, "Aging Supplier");
    const productId = await makeProduct(ctx, uomId, taxCategoryId, 500);

    const fortyFiveDaysAgo = new Date();
    fortyFiveDaysAgo.setDate(fortyFiveDaysAgo.getDate() - 45);

    const billId = await createStandaloneBill(ctx, { partnerId: supplier.id, dueDate: fortyFiveDaysAgo, lines: [{ productId, quantity: 1, discountPct: 0 }] });
    await postBill(ctx, billId);
    const bill = await getBill(ctx, billId);

    await recordBillPayment(ctx, { partnerId: supplier.id, amount: 100, method: "bank_transfer", allocations: [{ billId, amount: 100 }] });

    const report = await getApAgingReport(ctx);
    const partnerRow = report.partners.find((p) => p.partnerId === supplier.id);
    expect(partnerRow).toBeDefined();
    expect(partnerRow!.buckets["31-60"]).toBe(bill!.total - 100);
    expect(report.totals.total).toBeGreaterThanOrEqual(partnerRow!.buckets.total);
  });

  it("is scoped per tenant -- one tenant's purchase orders never show up in another's list", async () => {
    const a = await makeOwnerContext("Procurement Isolation A");
    const b = await makeOwnerContext("Procurement Isolation B");
    tenantIds.push(a.ctx.tenantId, b.ctx.tenantId);

    const supplier = await makeSupplier(a.ctx, "Isolated Supplier");
    const productId = await makeProduct(a.ctx, a.uomId, a.taxCategoryId, 10);
    await createPurchaseOrder(a.ctx, { partnerId: supplier.id, warehouseId: a.warehouseId, billingPolicy: "bill_received", lines: [{ productId, qtyOrdered: 1, discountPct: 0 }] });

    const { listPurchaseOrders } = await import("@/server/procurement/orders");
    const page = await listPurchaseOrders(b.ctx, { page: 1, pageSize: 50, filters: [], sort: [] });
    expect(page.rows).toHaveLength(0);
  });
});
