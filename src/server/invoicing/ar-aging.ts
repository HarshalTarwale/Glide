import "server-only";

import { withTenant } from "@/lib/db/tenant-client";
import { assertPermission } from "@/lib/auth/permissions";
import { aggregateAging, computeInvoiceOutstanding, type AgingBucketTotals } from "@/lib/invoicing/invoice-status";
import type { RequestContext } from "@/server/context";

/**
 * Accounts-receivable aging -- the roadmap's own acceptance line: "AR aging
 * reconciles." Built on posted invoices only (draft/cancelled never owe
 * anything), bucketed by src/lib/invoicing/invoice-status.ts's pure
 * aggregateAging so the bucket boundaries are exercised by golden tests
 * without touching the database.
 *
 * A due date is required to bucket an invoice; one posted without a
 * dueDate is treated as due on its invoiceDate (immediately due), matching
 * the common "net 0" convention rather than silently excluding it from the
 * report.
 */

export interface PartnerAgingDTO {
  partnerId: string;
  partnerName: string;
  buckets: AgingBucketTotals;
  invoiceCount: number;
}

export interface ArAgingReportDTO {
  asOf: string;
  partners: PartnerAgingDTO[];
  totals: AgingBucketTotals;
}

export async function getArAgingReport(ctx: RequestContext, asOf: Date = new Date()): Promise<ArAgingReportDTO> {
  assertPermission(ctx.permissions, "invoicing:invoice:read");

  return withTenant(ctx.tenantId, async (tx) => {
    const invoices = await tx.invoice.findMany({
      where: { status: { in: ["posted", "partially_paid", "paid"] } },
      include: { partner: { select: { id: true, name: true } } },
    });

    const byPartner = new Map<string, { name: string; lines: { invoiceId: string; partnerId: string; dueDate: Date; outstanding: number }[] }>();

    for (const invoice of invoices) {
      const outstanding = computeInvoiceOutstanding(Number(invoice.total.toString()), Number(invoice.amountPaid.toString()));
      if (outstanding <= 0) continue;

      const entry = byPartner.get(invoice.partnerId) ?? { name: invoice.partner.name, lines: [] };
      entry.lines.push({
        invoiceId: invoice.id,
        partnerId: invoice.partnerId,
        dueDate: invoice.dueDate ?? invoice.invoiceDate,
        outstanding,
      });
      byPartner.set(invoice.partnerId, entry);
    }

    const partners: PartnerAgingDTO[] = [...byPartner.entries()]
      .map(([partnerId, entry]) => ({
        partnerId,
        partnerName: entry.name,
        buckets: aggregateAging(entry.lines, asOf),
        invoiceCount: entry.lines.length,
      }))
      .sort((a, b) => b.buckets.total - a.buckets.total);

    const allLines = [...byPartner.values()].flatMap((e) => e.lines);
    const totals = aggregateAging(allLines, asOf);

    return { asOf: asOf.toISOString(), partners, totals };
  });
}
