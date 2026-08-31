import { afterAll, describe, expect, it } from "vitest";
import { signup } from "@/server/core/signup";
import { withTenant } from "@/lib/db/tenant-client";
import { createPartner } from "@/server/core/partners";
import {
  createSalesOrder,
  confirmSalesOrder,
  createDelivery,
  getSalesOrder,
} from "@/server/sales/orders";
import {
  createInvoiceFromOrder,
  createStandaloneInvoice,
  updateInvoiceLines,
  postInvoice,
  getInvoice,
} from "@/server/invoicing/invoices";
import { createCreditNote } from "@/server/invoicing/credit-notes";
import { recordPayment, getPayment } from "@/server/invoicing/payments";
import { getArAgingReport } from "@/server/invoicing/ar-aging";
import type { RequestContext } from "@/server/context";
import { unionPermissions } from "@/lib/auth/permissions";

/**
 * THE P4 ACCEPTANCE GATE (docs/roadmap.md §P4), verified end to end against
 * the live database, exactly the way P3's sales-orders.test.ts verifies its
 * own gate:
 *
 *   "order -> invoice -> PDF -> payment -> AR aging reconciles, a posted
 *    invoice cannot be edited, a correction produces a credit note, and one
 *    payment can settle parts of three invoices."
 *
 * (PDF generation is exercised separately — see tests/invoice-pdf.test.ts —
 * since it has no database dependency of its own.)
 */

const hasDatabase =
  Boolean(process.env.DATABASE_URL) && !process.env.DATABASE_URL?.includes("placeholder");
const describeWithDb = hasDatabase ? describe : describe.skip;

async function makeOwnerContext(orgName: string, country = "IN") {
  const result = await signup({
    name: "Test Owner",
    email: `invoicing-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`,
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

    // Same reasoning as sales-orders.test.ts: a real company must know its
    // filing state before GST can compute at all.
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

async function makeCustomer(ctx: RequestContext, name: string) {
  return createPartner(ctx, {
    name,
    kind: "company",
    isCustomer: true,
    isSupplier: false,
    paymentTermDays: 30,
    billingLine1: "1 Test Street",
    billingRegion: "Maharashtra",
    billingCountry: "IN",
  });
}

async function makeProduct(ctx: RequestContext, uomId: string, taxCategoryId: string, price: number) {
  return withTenant(ctx.tenantId, async (tx) => {
    const p = await tx.product.create({
      data: { tenantId: ctx.tenantId, sku: `INV-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, name: "Invoiced Widget", uomId, taxCategoryId, salesPrice: price },
    });
    return p.id;
  });
}

describeWithDb("Invoicing — the P4 acceptance gate", () => {
  const tenantIds: string[] = [];
  afterAll(async () => {
    const { prisma } = await import("@/lib/db/client");
    for (const id of tenantIds) await withTenant(id, (tx) => tx.tenant.delete({ where: { id } }));
    await prisma.$disconnect();
  });

  // This test chains the most round trips of any in this file (stock
  // receipt + order + confirm + a rejected invoice attempt + delivery + the
  // real invoice), and Neon's per-transaction connection latency varies
  // enough between runs to occasionally clear the file-wide 60s default --
  // same variance vitest.config.mts already documents for P3's heaviest
  // test. A longer per-test timeout, not a shorter test, is the honest fix.
  it("order -> invoice draws from delivered quantity, and posting a zero-total invoice is refused", async () => {
    const { ctx, uomId, taxCategoryId, warehouseId, stockLocationId } = await makeOwnerContext("Order Invoice Co");
    tenantIds.push(ctx.tenantId);

    const partner = await makeCustomer(ctx, "Order Invoice Customer");
    const productId = await makeProduct(ctx, uomId, taxCategoryId, 100);
    const { receiveStock } = await import("@/server/inventory/stock");
    await receiveStock(ctx, { productId, toLocationId: stockLocationId, quantity: 50, unitCost: 40 });

    const orderId = await createSalesOrder(ctx, {
      partnerId: partner.id,
      warehouseId,
      invoicingPolicy: "invoice_delivered",
      lines: [{ productId, qtyOrdered: 10, discountPct: 0 }],
    });
    await confirmSalesOrder(ctx, orderId);
    const order = await getSalesOrder(ctx, orderId);
    const lineId = order!.lines[0].id;

    // Cannot invoice before it ships (invoice_delivered policy, nothing delivered yet).
    await expect(
      createInvoiceFromOrder(ctx, orderId, { lines: [{ salesOrderLineId: lineId, quantity: 1 }] })
    ).rejects.toThrow(/only 0 remain invoiceable/);

    await createDelivery(ctx, orderId, { lines: [{ salesOrderLineId: lineId, quantity: 10 }] });

    const invoiceId = await createInvoiceFromOrder(ctx, orderId, { lines: [{ salesOrderLineId: lineId, quantity: 10 }] });
    const invoice = await getInvoice(ctx, invoiceId);
    expect(invoice!.status).toBe("draft");
    expect(invoice!.subtotal).toBe(1000);
    expect(invoice!.salesOrderId).toBe(orderId);

    const orderAfter = await getSalesOrder(ctx, orderId);
    expect(orderAfter!.lines[0].qtyInvoiced).toBe(10);
    expect(orderAfter!.status).toBe("invoiced");
  }, 120_000);

  it("a posted invoice is immutable: editing its lines is refused", async () => {
    const { ctx, uomId, taxCategoryId } = await makeOwnerContext("Immutable Co");
    tenantIds.push(ctx.tenantId);

    const partner = await makeCustomer(ctx, "Immutable Customer");
    const productId = await makeProduct(ctx, uomId, taxCategoryId, 200);

    const invoiceId = await createStandaloneInvoice(ctx, {
      partnerId: partner.id,
      lines: [{ productId, quantity: 2, discountPct: 0 }],
    });
    await postInvoice(ctx, invoiceId);

    const invoice = await getInvoice(ctx, invoiceId);
    expect(invoice!.status).toBe("posted");
    expect(invoice!.postedAt).not.toBeNull();

    await expect(
      updateInvoiceLines(ctx, invoiceId, { lines: [{ productId, quantity: 5, discountPct: 0 }] })
    ).rejects.toThrow(/immutable/);

    await expect(postInvoice(ctx, invoiceId)).rejects.toThrow(/Only a draft invoice can be posted/);
  });

  it("a posted invoice's tax breakdown is frozen even if tax settings change afterward", async () => {
    const { ctx, uomId, taxCategoryId } = await makeOwnerContext("Frozen Breakdown Co");
    tenantIds.push(ctx.tenantId);

    const partner = await makeCustomer(ctx, "Frozen Breakdown Customer");
    const productId = await makeProduct(ctx, uomId, taxCategoryId, 1000);

    const invoiceId = await createStandaloneInvoice(ctx, {
      partnerId: partner.id,
      lines: [{ productId, quantity: 1, discountPct: 0 }],
    });
    await postInvoice(ctx, invoiceId);

    const frozen = await getInvoice(ctx, invoiceId);
    expect(frozen!.taxComponents.length).toBeGreaterThan(0);

    // Change the tenant's configured rate for this exact category after
    // posting -- a live recomputation (what a draft still does) would now
    // produce a different breakdown. architecture.md §5.5 requires the
    // posted document not to.
    const existingRate = await withTenant(ctx.tenantId, (tx) =>
      tx.taxRate.findFirstOrThrow({ where: { tenantId: ctx.tenantId, taxCategoryId } })
    );
    await withTenant(ctx.tenantId, (tx) =>
      tx.taxRate.update({ where: { id: existingRate.id }, data: { rate: Number(existingRate.rate) + 50 } })
    );

    const after = await getInvoice(ctx, invoiceId);
    expect(after!.taxComponents).toEqual(frozen!.taxComponents);
    expect(after!.taxTotal).toBe(frozen!.taxTotal);
  });

  it("a correction produces a credit note, without rewriting the original invoice", async () => {
    const { ctx, uomId, taxCategoryId } = await makeOwnerContext("Credit Note Co");
    tenantIds.push(ctx.tenantId);

    const partner = await makeCustomer(ctx, "Credit Note Customer");
    const productId = await makeProduct(ctx, uomId, taxCategoryId, 100);

    const invoiceId = await createStandaloneInvoice(ctx, {
      partnerId: partner.id,
      lines: [{ productId, quantity: 5, discountPct: 0 }],
    });
    await postInvoice(ctx, invoiceId);
    const invoice = await getInvoice(ctx, invoiceId);
    const invoiceLineId = invoice!.lines[0].id;
    const originalTotal = invoice!.total;

    const creditNoteId = await createCreditNote(ctx, invoiceId, {
      reason: "Damaged in transit — 2 units returned",
      lines: [{ invoiceLineId, quantity: 2 }],
    });
    expect(creditNoteId).toBeTruthy();

    // The invoice itself never changes -- a credit note nets out separately.
    const invoiceAfter = await getInvoice(ctx, invoiceId);
    expect(invoiceAfter!.total).toBe(originalTotal);
    expect(invoiceAfter!.status).toBe("posted");

    // Crediting more than remains creditable is refused.
    await expect(
      createCreditNote(ctx, invoiceId, { reason: "Too much", lines: [{ invoiceLineId, quantity: 4 }] })
    ).rejects.toThrow(/only 3 remain creditable/);
  });

  // Three concurrent createStandaloneInvoice calls open three simultaneous
  // Neon connections -- see this file's earlier comment on per-test timeout
  // variance; concurrent connection setup adds to it rather than parallelizing
  // it away.
  it("one payment settles parts of three invoices, and each invoice's status reflects exactly what it received", async () => {
    const { ctx, uomId, taxCategoryId } = await makeOwnerContext("Multi Invoice Co");
    tenantIds.push(ctx.tenantId);

    const partner = await makeCustomer(ctx, "Multi Invoice Customer");
    const productA = await makeProduct(ctx, uomId, taxCategoryId, 100);
    const productB = await makeProduct(ctx, uomId, taxCategoryId, 200);
    const productC = await makeProduct(ctx, uomId, taxCategoryId, 300);

    const invoiceIds = await Promise.all(
      [productA, productB, productC].map((productId) =>
        createStandaloneInvoice(ctx, { partnerId: partner.id, lines: [{ productId, quantity: 1, discountPct: 0 }] })
      )
    );
    for (const id of invoiceIds) await postInvoice(ctx, id);

    const invoices = await Promise.all(invoiceIds.map((id) => getInvoice(ctx, id)));
    // Fully settle the first, partially settle the second, leave the third untouched.
    const paymentId = await recordPayment(ctx, {
      partnerId: partner.id,
      amount: invoices[0]!.total + 50,
      method: "bank_transfer",
      allocations: [
        { invoiceId: invoiceIds[0], amount: invoices[0]!.total },
        { invoiceId: invoiceIds[1], amount: 50 },
      ],
    });

    const payment = await getPayment(ctx, paymentId);
    expect(payment!.allocations).toHaveLength(2);
    expect(payment!.unallocatedAmount).toBe(0);

    const invoice0After = await getInvoice(ctx, invoiceIds[0]);
    const invoice1After = await getInvoice(ctx, invoiceIds[1]);
    const invoice2After = await getInvoice(ctx, invoiceIds[2]);
    expect(invoice0After!.status).toBe("paid");
    expect(invoice0After!.outstanding).toBe(0);
    expect(invoice1After!.status).toBe("partially_paid");
    expect(invoice1After!.amountPaid).toBe(50);
    expect(invoice2After!.status).toBe("posted");
    expect(invoice2After!.amountPaid).toBe(0);

    // Cannot allocate more than an invoice's outstanding balance.
    await expect(
      recordPayment(ctx, {
        partnerId: partner.id,
        amount: 10000,
        method: "bank_transfer",
        allocations: [{ invoiceId: invoiceIds[0], amount: 1 }],
      })
    ).rejects.toThrow(/only 0 is outstanding/);
  }, 120_000);

  it("AR aging buckets an overdue invoice correctly and reconciles to the outstanding total", async () => {
    const { ctx, uomId, taxCategoryId } = await makeOwnerContext("Aging Co");
    tenantIds.push(ctx.tenantId);

    const partner = await makeCustomer(ctx, "Aging Customer");
    const productId = await makeProduct(ctx, uomId, taxCategoryId, 500);

    const fortyFiveDaysAgo = new Date();
    fortyFiveDaysAgo.setDate(fortyFiveDaysAgo.getDate() - 45);

    const invoiceId = await createStandaloneInvoice(ctx, {
      partnerId: partner.id,
      dueDate: fortyFiveDaysAgo,
      lines: [{ productId, quantity: 1, discountPct: 0 }],
    });
    await postInvoice(ctx, invoiceId);
    const invoice = await getInvoice(ctx, invoiceId);

    // Pay part of it -- only the remaining balance should show up in aging.
    await recordPayment(ctx, {
      partnerId: partner.id,
      amount: 100,
      method: "bank_transfer",
      allocations: [{ invoiceId, amount: 100 }],
    });

    const report = await getArAgingReport(ctx);
    const partnerRow = report.partners.find((p) => p.partnerId === partner.id);
    expect(partnerRow).toBeDefined();
    expect(partnerRow!.buckets["31-60"]).toBe(invoice!.total - 100);
    expect(partnerRow!.buckets.total).toBe(invoice!.total - 100);
    expect(report.totals.total).toBeGreaterThanOrEqual(partnerRow!.buckets.total);
  });
});
