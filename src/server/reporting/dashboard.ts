import "server-only";

import { withTenant } from "@/lib/db/tenant-client";
import { computeBillOutstanding } from "@/lib/procurement/bill-status";
import { computeInvoiceOutstanding } from "@/lib/invoicing/invoice-status";
import type { RequestContext } from "@/server/context";

/**
 * The Overview page's data source. Unlike every other report in the
 * product, this one is shown to EVERY signed-in user regardless of role --
 * a Sales Representative and a Warehouse worker both land here after
 * login. So this file never calls assertPermission and never throws for a
 * missing permission: each section is included only if the caller's own
 * ctx.permissions already covers it, and simply omitted (null) otherwise.
 * That is different from every other server/ file in the codebase on
 * purpose -- see docs/architecture.md §2.3's layer 2 vs. this page's own
 * "layer 0, everyone gets *something*" need.
 */

export interface DashboardSummaryDTO {
  openSalesOrders: { count: number; value: number } | null;
  openPurchaseOrders: { count: number; value: number } | null;
  invoicedThisMonth: number | null;
  arOutstanding: number | null;
  apOutstanding: number | null;
  pipelineValue: number | null;
  lowStockCount: number | null;
  recentSalesOrders: { id: string; number: string; partnerName: string; status: string; total: number; currency: string; orderDate: string }[] | null;
}

export async function getDashboardSummary(ctx: RequestContext): Promise<DashboardSummaryDTO> {
  const has = (p: string) => ctx.permissions.has(p);

  return withTenant(ctx.tenantId, async (tx) => {
    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

    const [openSalesOrders, openPurchaseOrders, invoicedThisMonth, arOutstanding, apOutstanding, pipelineValue, lowStockCount, recentSalesOrders] = await Promise.all([
      has("sales:order:read")
        ? tx.salesOrder.aggregate({
            where: { status: { in: ["confirmed", "partially_delivered"] } },
            _count: true,
            _sum: { total: true },
          }).then((r) => ({ count: r._count, value: Number(r._sum.total ?? 0) }))
        : Promise.resolve(null),

      has("procurement:order:read")
        ? tx.purchaseOrder.aggregate({
            where: { status: { in: ["confirmed", "partially_received"] } },
            _count: true,
            _sum: { total: true },
          }).then((r) => ({ count: r._count, value: Number(r._sum.total ?? 0) }))
        : Promise.resolve(null),

      has("invoicing:invoice:read")
        ? tx.invoice.aggregate({
            where: { status: { notIn: ["draft", "cancelled"] }, invoiceDate: { gte: monthStart } },
            _sum: { total: true },
          }).then((r) => Number(r._sum.total ?? 0))
        : Promise.resolve(null),

      has("invoicing:invoice:read")
        ? tx.invoice
            .findMany({ where: { status: { in: ["posted", "partially_paid"] } }, select: { total: true, amountPaid: true } })
            .then((rows) => rows.reduce((sum, r) => sum + computeInvoiceOutstanding(Number(r.total), Number(r.amountPaid)), 0))
        : Promise.resolve(null),

      has("procurement:bill:read")
        ? tx.bill
            .findMany({ where: { status: { in: ["posted", "partially_paid"] } }, select: { total: true, amountPaid: true } })
            .then((rows) => rows.reduce((sum, r) => sum + computeBillOutstanding(Number(r.total), Number(r.amountPaid)), 0))
        : Promise.resolve(null),

      has("crm:opportunity:read")
        ? tx.opportunity
            .findMany({ where: { deletedAt: null, stage: { notIn: ["won", "lost"] } }, select: { expectedValue: true, probability: true } })
            .then((rows) => rows.reduce((sum, r) => sum + Number(r.expectedValue) * (r.probability / 100), 0))
        : Promise.resolve(null),

      has("inventory:stock:read")
        ? tx.product.findMany({ where: { type: "goods", deletedAt: null, reorderPoint: { not: null } }, select: { id: true, reorderPoint: true } }).then(async (products) => {
            if (products.length === 0) return 0;
            const quants = await tx.stockQuant.groupBy({
              by: ["productId"],
              where: { productId: { in: products.map((p) => p.id) }, location: { kind: { in: ["internal", "transit"] } } },
              _sum: { quantity: true },
            });
            const onHandByProduct = new Map(quants.map((q) => [q.productId, Number(q._sum.quantity ?? 0)]));
            // Matches getStockLevels()'s own isLow definition exactly (strict less-than).
            return products.filter((p) => (onHandByProduct.get(p.id) ?? 0) < Number(p.reorderPoint)).length;
          })
        : Promise.resolve(null),

      has("sales:order:read")
        ? tx.salesOrder
            .findMany({
              where: {},
              orderBy: { createdAt: "desc" },
              take: 6,
              include: { partner: { select: { name: true } } },
            })
            .then((rows) =>
              rows.map((r) => ({
                id: r.id,
                number: r.number,
                partnerName: r.partner.name,
                status: r.status,
                total: Number(r.total),
                currency: r.currency,
                orderDate: r.orderDate.toISOString(),
              }))
            )
        : Promise.resolve(null),
    ]);

    return { openSalesOrders, openPurchaseOrders, invoicedThisMonth, arOutstanding, apOutstanding, pipelineValue, lowStockCount, recentSalesOrders };
  });
}
