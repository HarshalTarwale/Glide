import { describe, expect, it } from "vitest";
import { withTenant, withUser } from "@/lib/db/tenant-client";
import { unionPermissions } from "@/lib/auth/permissions";
import { createSalesOrder, confirmSalesOrder, createDelivery, getSalesOrder } from "@/server/sales/orders";
import type { RequestContext } from "@/server/context";

/**
 * Creates one real, persistent, partially-delivered sales order in the demo
 * tenant, so /app/sales has something to click into in the browser rather
 * than an empty list. Same role as demo-data.test.ts / demo-stock.test.ts:
 * gated behind SEED_DEMO=1, safe to re-run (only adds a new order each time
 * rather than failing).
 */

const hasDatabase =
  Boolean(process.env.DATABASE_URL) && !process.env.DATABASE_URL?.includes("placeholder");
const enabled = hasDatabase && process.env.SEED_DEMO === "1";
const describeWithDb = enabled ? describe : describe.skip;

const DEMO_EMAIL = "demo@glide.app";

describeWithDb("demo sales order", () => {
  it("creates a confirmed, partially delivered order against the demo catalogue", async () => {
    const { prisma } = await import("@/lib/db/client");
    const user = await prisma.user.findUnique({ where: { email: DEMO_EMAIL }, select: { id: true } });
    if (!user) throw new Error(`Demo user ${DEMO_EMAIL} not found -- run demo-data.test.ts and demo-stock.test.ts first.`);

    const memberships = await withUser(user.id, (tx) => tx.membership.findMany({ where: { userId: user.id } }));
    const tenantId = memberships[0].tenantId;

    // The demo tenant's Company needs a region for GST place-of-supply --
    // the same real precondition tests/sales-orders.test.ts found. Set it
    // once here so the demo order (and any future one) can compute tax.
    await withTenant(tenantId, (tx) =>
      tx.company.updateMany({ where: { tenantId }, data: { region: "Maharashtra" } })
    );

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

    const { partnerId, warehouseId, productId, alreadyHasOrder } = await withTenant(tenantId, async (tx) => {
      const partner = await tx.partner.findFirstOrThrow({
        where: { tenantId, isCustomer: true },
        select: { id: true },
      });
      // A billing address is required for GST place-of-supply -- same
      // precondition as the company's own region above.
      const hasAddress = await tx.partnerAddress.findFirst({ where: { partnerId: partner.id, kind: "billing" } });
      if (!hasAddress) {
        await tx.partnerAddress.create({
          data: {
            tenantId,
            partnerId: partner.id,
            kind: "billing",
            isDefault: true,
            line1: "Industrial Estate",
            city: "Mumbai",
            region: "Maharashtra",
            country: "IN",
          },
        });
      }

      const warehouse = await tx.warehouse.findFirstOrThrow({ where: { tenantId }, select: { id: true } });
      const product = await tx.product.findFirstOrThrow({
        where: { tenantId, type: "goods" },
        select: { id: true },
      });
      const existing = await tx.salesOrder.findFirst({ where: { tenantId, partnerId: partner.id } });

      return { partnerId: partner.id, warehouseId: warehouse.id, productId: product.id, alreadyHasOrder: Boolean(existing) };
    });

    if (alreadyHasOrder) {
      console.log("\n  Demo tenant already has a sales order; not creating a duplicate.\n");
      return;
    }

    const orderId = await createSalesOrder(ctx, {
      partnerId,
      warehouseId,
      invoicingPolicy: "invoice_delivered",
      lines: [{ productId, qtyOrdered: 20, discountPct: 0 }],
    });
    await confirmSalesOrder(ctx, orderId);

    const order = await getSalesOrder(ctx, orderId);
    await createDelivery(ctx, orderId, { lines: [{ salesOrderLineId: order!.lines[0].id, quantity: 8 }] });

    const final = await getSalesOrder(ctx, orderId);
    expect(final!.status).toBe("partially_delivered");

    console.log(
      `\n  Demo sales order ready\n` +
        `    number: ${final!.number}\n` +
        `    status: ${final!.status}\n` +
        `    total:  ${final!.total} ${final!.currency}\n` +
        `    url:    /app/sales/${orderId}\n`
    );
  });
});
