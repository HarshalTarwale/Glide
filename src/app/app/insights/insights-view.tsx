"use client";

import Link from "next/link";
import { PageHeader } from "@/components/erp/page-header";
import { KpiTile } from "@/components/erp/kpi-tile";
import { EmptyState } from "@/components/erp/empty-state";
import { Money, DateText, Quantity } from "@/components/erp/money";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import type { BusinessInsightsDTO } from "@/server/reporting/insights";

function monthLabel(month: string): string {
  const [year, m] = month.split("-").map(Number);
  return new Date(Date.UTC(year, m - 1, 1)).toLocaleDateString(undefined, { month: "short", year: "2-digit", timeZone: "UTC" });
}

export function InsightsView({ insights }: { insights: BusinessInsightsDTO }) {
  const maxRevenue = Math.max(1, ...insights.revenueByMonth.map((p) => p.revenue));

  return (
    <>
      <PageHeader
        title="Business Insights"
        crumbs={[{ label: "Business Insights" }]}
        meta={
          <span>
            As of <DateText value={insights.asOf} />
          </span>
        }
      />

      <div className="flex-1 overflow-auto px-6 py-6">
        <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <KpiTile label="AR outstanding" value={<Money value={insights.arTotal} compact />} hint="owed to you" />
          <KpiTile label="AP outstanding" value={<Money value={insights.apTotal} compact />} hint="you owe" />
          <KpiTile label="Pipeline (weighted)" value={<Money value={insights.pipelineWeightedValue} compact />} hint={`${insights.pipelineOpenCount} open deals`} />
          <KpiTile label="Low-stock items" value={insights.lowStockItems.length} hint="below reorder point" />
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Revenue, last 6 months</CardTitle>
            </CardHeader>
            {insights.revenueByMonth.length === 0 ? (
              <EmptyState title="No posted invoices yet" description="Revenue trend appears once invoices are posted." />
            ) : (
              <div className="space-y-2.5 p-4">
                {insights.revenueByMonth.map((p) => (
                  <div key={p.month} className="flex items-center gap-3">
                    <span className="w-12 shrink-0 text-2xs text-ink-subtle">{monthLabel(p.month)}</span>
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-sunken">
                      <div className="h-full rounded-full bg-accent" style={{ width: `${(p.revenue / maxRevenue) * 100}%` }} />
                    </div>
                    <span className="w-24 shrink-0 text-right text-xs font-medium tnum">
                      <Money value={p.revenue} compact />
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Top customers (trailing 12mo)</CardTitle>
            </CardHeader>
            {insights.topCustomers.length === 0 ? (
              <EmptyState title="No posted invoices yet" description="Top customers appear once invoices are posted." />
            ) : (
              <table className="w-full border-collapse text-sm">
                <tbody>
                  {insights.topCustomers.map((c) => (
                    <tr key={c.partnerId} className="h-row border-b border-hairline last:border-0">
                      <td className="px-4">
                        <Link href={`/app/contacts/${c.partnerId}`} className="font-medium text-ink hover:underline">
                          {c.partnerName}
                        </Link>
                      </td>
                      <td className="px-4 text-right font-medium">
                        <Money value={c.revenue} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Top products (trailing 12mo)</CardTitle>
            </CardHeader>
            {insights.topProducts.length === 0 ? (
              <EmptyState title="No posted invoices yet" description="Top products appear once invoices are posted." />
            ) : (
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-hairline bg-surface-sunken text-2xs uppercase tracking-wide text-ink-subtle">
                    <th className="px-4 py-2 text-left font-semibold">Product</th>
                    <th className="px-4 py-2 text-right font-semibold">Qty sold</th>
                    <th className="px-4 py-2 text-right font-semibold">Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {insights.topProducts.map((p) => (
                    <tr key={p.productId} className="h-row border-b border-hairline last:border-0">
                      <td className="px-4">
                        <span className="font-medium text-ink">{p.productName}</span>{" "}
                        <span className="font-mono text-2xs text-ink-subtle">({p.productSku})</span>
                      </td>
                      <td className="px-4 text-right">
                        <Quantity value={p.quantity} />
                      </td>
                      <td className="px-4 text-right font-medium">
                        <Money value={p.revenue} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Low stock</CardTitle>
            </CardHeader>
            {insights.lowStockItems.length === 0 ? (
              <EmptyState title="Nothing below reorder point" description="Every tracked product has enough stock right now." />
            ) : (
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-hairline bg-surface-sunken text-2xs uppercase tracking-wide text-ink-subtle">
                    <th className="px-4 py-2 text-left font-semibold">Product</th>
                    <th className="px-4 py-2 text-right font-semibold">On hand</th>
                    <th className="px-4 py-2 text-right font-semibold">Reorder point</th>
                  </tr>
                </thead>
                <tbody>
                  {insights.lowStockItems.map((s) => (
                    <tr key={s.productId} className="h-row border-b border-hairline last:border-0">
                      <td className="px-4">
                        <span className="font-medium text-ink">{s.name}</span> <span className="font-mono text-2xs text-ink-subtle">({s.sku})</span>
                      </td>
                      <td className="px-4 text-right text-danger">
                        <Quantity value={s.onHand} />
                      </td>
                      <td className="px-4 text-right text-ink-muted">{s.reorderPoint ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
