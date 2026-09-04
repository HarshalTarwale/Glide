import { describe, expect, it } from "vitest";
import {
  deriveBillStatus,
  computeBillLineSubtotal,
  computeBillLineTotals,
  computeBillTotals,
  computeUnallocated,
  computeBillOutstanding,
  ageBucket,
  aggregateAging,
  type AgingLine,
} from "@/lib/procurement/bill-status";

describe("deriveBillStatus — the buy-side mirror of invoice-status.ts", () => {
  it("an unposted bill is draft regardless of anything paid against it", () => {
    expect(deriveBillStatus(1000, 0, false, false)).toBe("draft");
  });

  it("cancelled overrides everything else, even a partially paid bill", () => {
    expect(deriveBillStatus(1000, 400, true, true)).toBe("cancelled");
  });

  it("posted with nothing paid yet is exactly \"posted\"", () => {
    expect(deriveBillStatus(1000, 0, false, true)).toBe("posted");
  });

  it("any payment short of the full total is partially_paid", () => {
    expect(deriveBillStatus(1000, 400, false, true)).toBe("partially_paid");
  });

  it("payment covering the full total is paid", () => {
    expect(deriveBillStatus(1000, 1000, false, true)).toBe("paid");
  });

  it("overpayment still reads as paid, never overflows past it", () => {
    expect(deriveBillStatus(1000, 1200, false, true)).toBe("paid");
  });
});

describe("bill line and header totals", () => {
  it("computes subtotal net of a percentage discount", () => {
    expect(computeBillLineSubtotal({ quantity: 10, unitCost: 100, discountPct: 10, taxRate: 0 })).toBe(900);
  });

  it("computes tax on the discounted subtotal", () => {
    const totals = computeBillLineTotals({ quantity: 10, unitCost: 100, discountPct: 10, taxRate: 18 });
    expect(totals.subtotal).toBe(900);
    expect(totals.taxAmount).toBe(162);
    expect(totals.total).toBe(1062);
  });

  it("header totals sum every line independently", () => {
    const lineA = computeBillLineTotals({ quantity: 10, unitCost: 100, discountPct: 0, taxRate: 18 });
    const lineB = computeBillLineTotals({ quantity: 2, unitCost: 50, discountPct: 5, taxRate: 5 });
    const header = computeBillTotals([lineA, lineB]);
    expect(header.subtotal).toBe(lineA.subtotal + lineB.subtotal);
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

  it("computes a bill's outstanding balance from what has been paid", () => {
    expect(computeBillOutstanding(1000, 400)).toBe(600);
  });
});

describe("AP aging", () => {
  const asOf = new Date("2026-08-31");

  it("buckets correctly across the standard ranges", () => {
    expect(ageBucket(new Date("2026-09-15"), asOf)).toBe("current");
    expect(ageBucket(new Date("2026-08-16"), asOf)).toBe("1-30");
    expect(ageBucket(new Date("2026-07-17"), asOf)).toBe("31-60");
    expect(ageBucket(new Date("2026-06-17"), asOf)).toBe("61-90");
    expect(ageBucket(new Date("2026-05-03"), asOf)).toBe("90+");
  });

  it("aggregates several bills for one partner into the right buckets", () => {
    const lines: AgingLine[] = [
      { billId: "1", partnerId: "s1", dueDate: new Date("2026-09-15"), outstanding: 500 },
      { billId: "2", partnerId: "s1", dueDate: new Date("2026-08-16"), outstanding: 200 },
      { billId: "3", partnerId: "s1", dueDate: new Date("2026-05-03"), outstanding: 100 },
    ];
    const totals = aggregateAging(lines, asOf);
    expect(totals.current).toBe(500);
    expect(totals["1-30"]).toBe(200);
    expect(totals["90+"]).toBe(100);
    expect(totals.total).toBe(800);
  });

  it("a fully paid bill contributes nothing to any bucket", () => {
    const lines: AgingLine[] = [{ billId: "1", partnerId: "s1", dueDate: new Date("2026-05-03"), outstanding: 0 }];
    expect(aggregateAging(lines, asOf).total).toBe(0);
  });
});
