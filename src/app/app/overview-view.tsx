"use client";

import Link from "next/link";
import { ArrowUpRight, Boxes, Plus, Receipt, ShoppingCart, Truck } from "lucide-react";
import { PageHeader } from "@/components/erp/page-header";
import { KpiTile } from "@/components/erp/kpi-tile";
import { EmptyState } from "@/components/erp/empty-state";
import { Money, DateText, Code } from "@/components/erp/money";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { PermissionGate } from "@/components/layout/session-context";
import type { DashboardSummaryDTO } from "@/server/reporting/dashboard";

const STATUS_TONE: Record<string, "neutral" | "info" | "warning" | "accent" | "success" | "danger"> = {
  draft: "neutral",
  confirmed: "info",
  partially_delivered: "warning",
  delivered: "accent",
  invoiced: "success",
  cancelled: "danger",
};

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  confirmed: "Confirmed",
  partially_delivered: "Part. delivered",
  delivered: "Delivered",
  invoiced: "Invoiced",
  cancelled: "Cancelled",
};

export function OverviewView({ summary }: { summary: DashboardSummaryDTO }) {
  const tiles: { label: string; value: React.ReactNode; hint?: string }[] = [];

  if (summary.openSalesOrders) {
    tiles.push({ label: "Open order value", value: <Money value={summary.openSalesOrders.value} compact /> });
    tiles.push({ label: "Open orders", value: summary.openSalesOrders.count });
  }
  if (summary.invoicedThisMonth !== null) {
    tiles.push({ label: "Invoiced this month", value: <Money value={summary.invoicedThisMonth} compact /> });
  }
  if (summary.arOutstanding !== null) {
    tiles.push({ label: "AR outstanding", value: <Money value={summary.arOutstanding} compact />, hint: "owed to you" });
  }
  if (summary.apOutstanding !== null) {
    tiles.push({ label: "AP outstanding", value: <Money value={summary.apOutstanding} compact />, hint: "you owe" });
  }
  if (summary.pipelineValue !== null) {
    tiles.push({ label: "Pipeline (weighted)", value: <Money value={summary.pipelineValue} compact /> });
  }
  if (summary.lowStockCount !== null) {
    tiles.push({ label: "Low-stock items", value: summary.lowStockCount, hint: "below reorder point" });
  }

  const quickLinks = [
    summary.openSalesOrders ? { label: "Sales orders", href: "/app/sales", icon: ShoppingCart, hint: `${summary.openSalesOrders.count} open` } : null,
    summary.openPurchaseOrders ? { label: "Purchase orders", href: "/app/procurement/orders", icon: Truck, hint: `${summary.openPurchaseOrders.count} open` } : null,
    summary.lowStockCount !== null ? { label: "Inventory", href: "/app/inventory/stock", icon: Boxes, hint: `${summary.lowStockCount} low stock` } : null,
    summary.arOutstanding !== null ? { label: "Invoices", href: "/app/invoices", icon: Receipt, hint: "view all" } : null,
  ].filter((x): x is { label: string; href: string; icon: typeof ShoppingCart; hint: string } => x !== null);

  return (
    <>
      <PageHeader
        title="Overview"
        meta="Everything happening across your business today."
        actions={
          <>
            <PermissionGate permission="sales:order:write">
              <Button variant="secondary" size="md" asChild>
                <Link href="/app/sales/new">
                  <Plus />
                  New order
                </Link>
              </Button>
            </PermissionGate>
            <PermissionGate permission="invoicing:invoice:write">
              <Button variant="primary" size="md" asChild>
                <Link href="/app/invoices/new">
                  <Receipt />
                  New invoice
                </Link>
              </Button>
            </PermissionGate>
          </>
        }
      />

      <div className="flex-1 overflow-auto px-6 py-6">
        {tiles.length > 0 ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {tiles.map((t) => (
              <KpiTile key={t.label} label={t.label} value={t.value} hint={t.hint} />
            ))}
          </div>
        ) : null}

        <div className="mt-6 grid gap-4 lg:grid-cols-3">
          {summary.recentSalesOrders ? (
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Recent sales orders</CardTitle>
                <Button variant="link" size="sm" asChild>
                  <Link href="/app/sales">
                    View all <ArrowUpRight className="size-3" />
                  </Link>
                </Button>
              </CardHeader>
              {summary.recentSalesOrders.length === 0 ? (
                <EmptyState title="No sales orders yet" description="Create the first one to see it here." />
              ) : (
                <table className="w-full border-collapse text-sm">
                  <tbody>
                    {summary.recentSalesOrders.map((o) => (
                      <tr key={o.id} className="h-row border-b border-hairline last:border-0">
                        <td className="px-4">
                          <Code>{o.number}</Code>
                        </td>
                        <td className="px-4 text-ink">{o.partnerName}</td>
                        <td className="px-4 text-ink-muted">
                          <DateText value={o.orderDate} />
                        </td>
                        <td className="px-4">
                          <Badge tone={STATUS_TONE[o.status] ?? "neutral"} dot>
                            {STATUS_LABEL[o.status] ?? o.status}
                          </Badge>
                        </td>
                        <td className="px-4 text-right font-medium">
                          <Money value={o.total} currency={o.currency} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Card>
          ) : null}

          {quickLinks.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>Jump back in</CardTitle>
              </CardHeader>
              <CardBody className="space-y-2">
                {quickLinks.map((s) => (
                  <Link
                    key={s.label}
                    href={s.href}
                    className="flex items-center gap-3 rounded-md border border-hairline px-3 py-2.5 transition-colors hover:border-hairline-strong hover:bg-surface-sunken"
                  >
                    <s.icon className="size-4 text-ink-subtle" />
                    <span className="text-sm font-medium text-ink">{s.label}</span>
                    <span className="ml-auto text-2xs text-ink-subtle">{s.hint}</span>
                  </Link>
                ))}
              </CardBody>
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}
