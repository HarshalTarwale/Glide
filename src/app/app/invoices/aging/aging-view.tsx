"use client";

import Link from "next/link";
import { PageHeader } from "@/components/erp/page-header";
import { KpiTile } from "@/components/erp/kpi-tile";
import { EmptyState } from "@/components/erp/empty-state";
import { Money, DateText } from "@/components/erp/money";
import { CircleDollarSign } from "lucide-react";
import type { ArAgingReportDTO } from "@/server/invoicing/ar-aging";

const BUCKETS: { key: keyof ArAgingReportDTO["totals"]; label: string }[] = [
  { key: "current", label: "Current" },
  { key: "1-30", label: "1–30 days" },
  { key: "31-60", label: "31–60 days" },
  { key: "61-90", label: "61–90 days" },
  { key: "90+", label: "90+ days" },
];

export function AgingView({ report }: { report: ArAgingReportDTO }) {
  if (report.partners.length === 0) {
    return (
      <>
        <PageHeader title="AR Aging" crumbs={[{ label: "Finance", href: "/app/invoices" }, { label: "AR Aging" }]} />
        <EmptyState icon={CircleDollarSign} title="Nothing outstanding" description="No posted invoice has a balance due right now." />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="AR Aging"
        crumbs={[{ label: "Finance", href: "/app/invoices" }, { label: "AR Aging" }]}
        meta={
          <span>
            As of <DateText value={report.asOf} />
          </span>
        }
      />

      <div className="flex-1 overflow-auto px-6 py-6">
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <KpiTile label="Total outstanding" value={<Money value={report.totals.total} />} className="lg:col-span-1" />
          {BUCKETS.map((b) => (
            <KpiTile key={b.key} label={b.label} value={<Money value={report.totals[b.key]} compact />} />
          ))}
        </div>

        <div className="overflow-hidden rounded-lg border border-hairline">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-hairline bg-surface-sunken text-2xs uppercase tracking-wide text-ink-subtle">
                  <th className="px-3 py-2 text-left font-semibold">Customer</th>
                  <th className="px-3 py-2 text-right font-semibold">Invoices</th>
                  {BUCKETS.map((b) => (
                    <th key={b.key} className="px-3 py-2 text-right font-semibold">
                      {b.label}
                    </th>
                  ))}
                  <th className="px-3 py-2 text-right font-semibold">Total</th>
                </tr>
              </thead>
              <tbody>
                {report.partners.map((p) => (
                  <tr key={p.partnerId} className="h-row border-b border-hairline last:border-0">
                    <td className="px-3 font-medium text-ink">
                      <Link href={`/app/invoices?search=${encodeURIComponent(p.partnerName)}`} className="hover:underline">
                        {p.partnerName}
                      </Link>
                    </td>
                    <td className="tnum px-3 text-right text-ink-muted">{p.invoiceCount}</td>
                    {BUCKETS.map((b) => (
                      <td key={b.key} className="px-3 text-right">
                        {p.buckets[b.key] > 0 ? <Money value={p.buckets[b.key]} /> : <span className="text-ink-subtle">—</span>}
                      </td>
                    ))}
                    <td className="px-3 text-right font-medium">
                      <Money value={p.buckets.total} />
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-hairline bg-surface-sunken font-medium">
                  <td className="px-3 py-2">Total</td>
                  <td className="px-3 py-2 text-right"></td>
                  {BUCKETS.map((b) => (
                    <td key={b.key} className="px-3 py-2 text-right">
                      <Money value={report.totals[b.key]} />
                    </td>
                  ))}
                  <td className="px-3 py-2 text-right">
                    <Money value={report.totals.total} />
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}
