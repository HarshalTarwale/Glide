import { describe, expect, it } from "vitest";
import {
  deriveInvoiceStatus,
  computeInvoiceLineSubtotal,
  computeInvoiceLineTotals,
  computeInvoiceTotals,
  computeUnallocated,
  computeInvoiceOutstanding,
  ageBucket,
  aggregateAging,
  type AgingLine,
} from "@/lib/invoicing/invoice-status";

describe("deriveInvoiceStatus", () => {
  it("an unposted invoice is draft regardless of anything paid against it", () => {
    expect(deriveInvoiceStatus(1000, 0, false, false)).toBe("draft");
  });

  it("cancelled overrides everything else, even a partially paid invoice", () => {
    expect(deriveInvoiceStatus(1000, 400, true, true)).toBe("cancelled");
  });

  it("posted with nothing paid yet is exactly \"posted\"", () => {
    expect(deriveInvoiceStatus(1000, 0, false, true)).toBe("posted");
  });

  it("any payment short of the full total is partially_paid", () => {
    expect(deriveInvoiceStatus(1000, 400, false, true)).toBe("partially_paid");
  });

  it("payment covering the full total is paid", () => {
    expect(deriveInvoiceStatus(1000, 1000, false, true)).toBe("paid");
  });

  it("overpayment still reads as paid, never overflows past it", () => {
    expect(deriveInvoiceStatus(1000, 1200, false, true)).toBe("paid");
  });

  it("a zero-total posted invoice (e.g. fully discounted) with no payment is posted, not paid", () => {
    // total > 0 is required for the "paid" branch specifically so a
    // freshly-posted $0 invoice never reads as trivially paid before the
    // service layer has decided that's actually correct.
    expect(deriveInvoiceStatus(0, 0, false, true)).toBe("posted");
  });
});

describe("invoice line and header totals", () => {
  it("computes subtotal net of a percentage discount", () => {
    const subtotal = computeInvoiceLineSubtotal({ quantity: 10, unitPrice: 100, discountPct: 10, taxRate: 0 });
    expect(subtotal).toBe(900);
  });

  it("computes tax on the discounted subtotal, not the gross amount", () => {
    const totals = computeInvoiceLineTotals({ quantity: 10, unitPrice: 100, discountPct: 10, taxRate: 18 });
    expect(totals.subtotal).toBe(900);
    expect(totals.taxAmount).toBe(162);
    expect(totals.total).toBe(1062);
  });

  it("header totals sum every line independently", () => {
    const lineA = computeInvoiceLineTotals({ quantity: 10, unitPrice: 100, discountPct: 0, taxRate: 18 });
    const lineB = computeInvoiceLineTotals({ quantity: 2, unitPrice: 50, discountPct: 5, taxRate: 5 });
    const header = computeInvoiceTotals([lineA, lineB]);

    expect(header.subtotal).toBe(lineA.subtotal + lineB.subtotal);
    expect(header.taxAmount).toBe(lineA.taxAmount + lineB.taxAmount);
    expect(header.total).toBe(header.subtotal + header.taxAmount);
  });
});

describe("payment allocation math", () => {
  it("computes the unallocated remainder of a payment", () => {
    expect(computeUnallocated(1000, 400)).toBe(600);
  });

  it("never goes negative even if allocation somehow exceeds the payment", () => {
    expect(computeUnallocated(1000, 1500)).toBe(0);
  });

  it("computes an invoice's outstanding balance from what has been paid", () => {
    expect(computeInvoiceOutstanding(1000, 400)).toBe(600);
  });

  it("outstanding never goes negative on an overpaid invoice", () => {
    expect(computeInvoiceOutstanding(1000, 1200)).toBe(0);
  });
});

describe("AR aging", () => {
  const asOf = new Date("2026-08-31");

  it("a not-yet-due invoice buckets as current", () => {
    expect(ageBucket(new Date("2026-09-15"), asOf)).toBe("current");
  });

  it("due exactly today buckets as current", () => {
    expect(ageBucket(new Date("2026-08-31"), asOf)).toBe("current");
  });

  it("15 days past due buckets as 1-30", () => {
    expect(ageBucket(new Date("2026-08-16"), asOf)).toBe("1-30");
  });

  it("45 days past due buckets as 31-60", () => {
    expect(ageBucket(new Date("2026-07-17"), asOf)).toBe("31-60");
  });

  it("75 days past due buckets as 61-90", () => {
    expect(ageBucket(new Date("2026-06-17"), asOf)).toBe("61-90");
  });

  it("120 days past due buckets as 90+", () => {
    expect(ageBucket(new Date("2026-05-03"), asOf)).toBe("90+");
  });

  it("aggregates several invoices for one partner into the right buckets", () => {
    const lines: AgingLine[] = [
      { invoiceId: "1", partnerId: "p1", dueDate: new Date("2026-09-15"), outstanding: 500 }, // current
      { invoiceId: "2", partnerId: "p1", dueDate: new Date("2026-08-16"), outstanding: 200 }, // 1-30
      { invoiceId: "3", partnerId: "p1", dueDate: new Date("2026-05-03"), outstanding: 100 }, // 90+
    ];
    const totals = aggregateAging(lines, asOf);
    expect(totals.current).toBe(500);
    expect(totals["1-30"]).toBe(200);
    expect(totals["90+"]).toBe(100);
    expect(totals.total).toBe(800);
  });

  it("a fully paid invoice (outstanding 0) contributes nothing to any bucket", () => {
    const lines: AgingLine[] = [
      { invoiceId: "1", partnerId: "p1", dueDate: new Date("2026-05-03"), outstanding: 0 },
    ];
    const totals = aggregateAging(lines, asOf);
    expect(totals.total).toBe(0);
  });
});
