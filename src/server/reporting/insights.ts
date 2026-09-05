import "server-only";

import { withTenant } from "@/lib/db/tenant-client";
import { assertPermission } from "@/lib/auth/permissions";
import { getArAgingReport } from "@/server/invoicing/ar-aging";
import { getApAgingReport } from "@/server/procurement/ap-aging";
import { getPipeline } from "@/server/crm/opportunities";
import { getStockLevels } from "@/server/inventory/stock";
import type { RequestContext } from "@/server/context";

/**
 * Business Insights: cross-module analytics beyond the three financial
 * statements accounting/reports.ts already builds. Gated behind ONE
 * permission (`reporting:insights:read`) rather than trying to show a
 * partial view per role, the way the Overview dashboard does -- Insights
 * spans modules a single functional role has no business need to see all
 * of at once (AP totals for a Sales Manager, pipeline value for an
 * Accountant), so v1 grants it only to Owner/Administrator (who already
 * hold every underlying permission via ALL_PERMISSIONS) and Viewer (via
 * the existing "every :read permission" rule) -- see permissions.ts.
 * Extending it to more roles is a real product decision, not assumed here.
 */

export interface MonthlyRevenuePoint {
  month: string; // "2026-01"
  revenue: number;
}

export interface TopCustomerDTO {
  partnerId: string;
  partnerName: string;
  revenue: number;
}

export interface TopProductDTO {
  productId: string;
  productName: string;
  productSku: string;
  revenue: number;
  quantity: number;
}

export interface BusinessInsightsDTO {
  asOf: string;
  revenueByMonth: MonthlyRevenuePoint[];
  topCustomers: TopCustomerDTO[];
  topProducts: TopProductDTO[];
  arTotal: number;
  apTotal: number;
  pipelineWeightedValue: number;
  pipelineOpenCount: number;
  lowStockItems: { productId: string; sku: string; name: string; onHand: number; reorderPoint: number | null }[];
}

const LOOKBACK_MONTHS = 6;
const TRAILING_MONTHS_FOR_TOP_LISTS = 12;

export async function getBusinessInsights(ctx: RequestContext): Promise<BusinessInsightsDTO> {
  assertPermission(ctx.permissions, "reporting:insights:read");

  const now = new Date();
  const revenueWindowStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (LOOKBACK_MONTHS - 1), 1));
  const trailingWindowStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (TRAILING_MONTHS_FOR_TOP_LISTS - 1), 1));

  // The raw aggregation queries share one tenant-scoped connection; the
  // other four calls each open their OWN withTenant() transaction (they are
  // the exported, permission-checked functions other pages use directly),
  // so they run alongside rather than nested inside the block below --
  // nesting one interactive transaction inside another is the exact
  // orphaned-write risk leads.ts's own convertLead() comment warns about.
  const [[revenueByMonth, topCustomers, topProducts], arReport, apReport, pipeline, stockLevels] = await Promise.all([
    withTenant(ctx.tenantId, (tx) =>
      Promise.all([
        tx.$queryRaw<{ month: string; revenue: string }[]>`
          SELECT to_char(date_trunc('month', "invoiceDate"), 'YYYY-MM') AS month, COALESCE(SUM(total), 0) AS revenue
          FROM invoice
          WHERE status != 'draft' AND status != 'cancelled' AND "invoiceDate" >= ${revenueWindowStart}
          GROUP BY 1
          ORDER BY 1
        `,
        tx.$queryRaw<{ partner_id: string; partner_name: string; revenue: string }[]>`
          SELECT p.id AS partner_id, p.name AS partner_name, SUM(i.total) AS revenue
          FROM invoice i
          JOIN partner p ON p.id = i."partnerId"
          WHERE i.status != 'draft' AND i.status != 'cancelled' AND i."invoiceDate" >= ${trailingWindowStart}
          GROUP BY p.id, p.name
          ORDER BY revenue DESC
          LIMIT 5
        `,
        tx.$queryRaw<{ product_id: string; product_name: string; product_sku: string; revenue: string; quantity: string }[]>`
          SELECT pr.id AS product_id, pr.name AS product_name, pr.sku AS product_sku, SUM(il.total) AS revenue, SUM(il.quantity) AS quantity
          FROM invoice_line il
          JOIN invoice i ON i.id = il."invoiceId"
          JOIN product pr ON pr.id = il."productId"
          WHERE i.status != 'draft' AND i.status != 'cancelled' AND i."invoiceDate" >= ${trailingWindowStart}
          GROUP BY pr.id, pr.name, pr.sku
          ORDER BY revenue DESC
          LIMIT 5
        `,
      ])
    ),
    getArAgingReport(ctx, now),
    getApAgingReport(ctx, now),
    getPipeline(ctx),
    getStockLevels(ctx),
  ]);

  return {
    asOf: now.toISOString(),
    revenueByMonth: revenueByMonth.map((r) => ({ month: r.month, revenue: Number(r.revenue) })),
    topCustomers: topCustomers.map((r) => ({ partnerId: r.partner_id, partnerName: r.partner_name, revenue: Number(r.revenue) })),
    topProducts: topProducts.map((r) => ({ productId: r.product_id, productName: r.product_name, productSku: r.product_sku, revenue: Number(r.revenue), quantity: Number(r.quantity) })),
    arTotal: arReport.totals.total,
    apTotal: apReport.totals.total,
    pipelineWeightedValue: pipeline.summary.weightedValue,
    pipelineOpenCount: pipeline.summary.openCount,
    lowStockItems: stockLevels.filter((s) => s.isLow).map((s) => ({ productId: s.productId, sku: s.sku, name: s.name, onHand: s.onHand, reorderPoint: s.reorderPoint })),
  };
}
