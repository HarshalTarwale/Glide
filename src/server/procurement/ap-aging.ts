import "server-only";

import { withTenant } from "@/lib/db/tenant-client";
import { assertPermission } from "@/lib/auth/permissions";
import { aggregateAging, computeBillOutstanding, type AgingBucketTotals } from "@/lib/procurement/bill-status";
import type { RequestContext } from "@/server/context";

/** Accounts-payable aging — the exact mirror of src/server/invoicing/ar-aging.ts, applied to what WE owe suppliers. */

export interface PartnerApAgingDTO {
  partnerId: string;
  partnerName: string;
  buckets: AgingBucketTotals;
  billCount: number;
}

export interface ApAgingReportDTO {
  asOf: string;
  partners: PartnerApAgingDTO[];
  totals: AgingBucketTotals;
}

export async function getApAgingReport(ctx: RequestContext, asOf: Date = new Date()): Promise<ApAgingReportDTO> {
  assertPermission(ctx.permissions, "procurement:bill:read");

  return withTenant(ctx.tenantId, async (tx) => {
    const bills = await tx.bill.findMany({
      where: { status: { in: ["posted", "partially_paid", "paid"] } },
      include: { partner: { select: { id: true, name: true } } },
    });

    const byPartner = new Map<string, { name: string; lines: { billId: string; partnerId: string; dueDate: Date; outstanding: number }[] }>();

    for (const bill of bills) {
      const outstanding = computeBillOutstanding(Number(bill.total.toString()), Number(bill.amountPaid.toString()));
      if (outstanding <= 0) continue;

      const entry = byPartner.get(bill.partnerId) ?? { name: bill.partner.name, lines: [] };
      entry.lines.push({ billId: bill.id, partnerId: bill.partnerId, dueDate: bill.dueDate ?? bill.billDate, outstanding });
      byPartner.set(bill.partnerId, entry);
    }

    const partners: PartnerApAgingDTO[] = [...byPartner.entries()]
      .map(([partnerId, entry]) => ({ partnerId, partnerName: entry.name, buckets: aggregateAging(entry.lines, asOf), billCount: entry.lines.length }))
      .sort((a, b) => b.buckets.total - a.buckets.total);

    const allLines = [...byPartner.values()].flatMap((e) => e.lines);
    const totals = aggregateAging(allLines, asOf);

    return { asOf: asOf.toISOString(), partners, totals };
  });
}
