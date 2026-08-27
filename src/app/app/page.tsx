"use client";

import Link from "next/link";
import { ArrowUpRight, Boxes, Plus, Receipt, ShoppingCart } from "lucide-react";
import { PageHeader } from "@/components/erp/page-header";
import { KpiTile } from "@/components/erp/kpi-tile";
import { Money, DateText, Code } from "@/components/erp/money";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { useFormatContext } from "@/components/erp/format-context";
import { formatMoney } from "@/lib/format";
import { SALES_ORDERS, STATUS_META } from "@/lib/mock/sales-orders";

export default function OverviewPage() {
  const ctx = useFormatContext();
  const recent = SALES_ORDERS.slice(0, 6);

  const openOrders = SALES_ORDERS.filter((o) => o.status === "confirmed" || o.status === "partially_delivered");
  const pipeline = openOrders.reduce((s, o) => s + o.total, 0);
  const invoiced = SALES_ORDERS.filter((o) => o.status === "invoiced").reduce((s, o) => s + o.total, 0);

  return (
    <>
      <PageHeader
        title="Overview"
        meta="Everything happening across your business today."
        actions={
          <>
            <Button variant="secondary" size="md">
              <Plus />
              New order
            </Button>
            <Button variant="primary" size="md">
              <Receipt />
              New invoice
            </Button>
          </>
        }
      />

      <div className="flex-1 overflow-auto px-6 py-6">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <KpiTile
            label="Open order value"
            value={formatMoney(pipeline, ctx, { compact: true })}
            delta={12.4}
            hint="vs last month"
          />
          <KpiTile label="Open orders" value={openOrders.length} delta={4.1} hint="vs last month" />
          <KpiTile
            label="Invoiced this period"
            value={formatMoney(invoiced, ctx, { compact: true })}
            delta={-2.8}
            hint="vs last month"
          />
          <KpiTile label="Low-stock items" value={7} hint="below reorder point" />
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Recent sales orders</CardTitle>
              <Button variant="link" size="sm" asChild>
                <Link href="/app/sales">
                  View all <ArrowUpRight className="size-3" />
                </Link>
              </Button>
            </CardHeader>
            <table className="w-full border-collapse text-sm">
              <tbody>
                {recent.map((o) => {
                  const meta = STATUS_META[o.status];
                  return (
                    <tr key={o.id} className="h-row border-b border-hairline last:border-0">
                      <td className="px-4">
                        <Code>{o.number}</Code>
                      </td>
                      <td className="px-4 text-ink">{o.customer}</td>
                      <td className="px-4 text-ink-muted">
                        <DateText value={o.orderDate} />
                      </td>
                      <td className="px-4">
                        <Badge tone={meta.tone} dot>
                          {meta.label}
                        </Badge>
                      </td>
                      <td className="px-4 text-right font-medium">
                        <Money value={o.total} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Jump back in</CardTitle>
            </CardHeader>
            <CardBody className="space-y-2">
              {[
                { label: "Sales orders", href: "/app/sales", icon: ShoppingCart, hint: `${SALES_ORDERS.length} records` },
                { label: "Inventory", href: "/app/inventory", icon: Boxes, hint: "Coming in P2" },
                { label: "Invoices", href: "/app/invoices", icon: Receipt, hint: "Coming in P4" },
              ].map((s) => (
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
        </div>
      </div>
    </>
  );
}
