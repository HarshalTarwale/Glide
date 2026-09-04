import { describe, expect, it } from "vitest";
import {
  deriveStatus,
  computeLineSubtotal,
  computeLineTotals,
  computeOrderTotals,
  type LineQuantities,
} from "@/lib/procurement/order-status";

describe("deriveStatus (purchase order) — the buy-side mirror of Sales' own rule", () => {
  it("an unconfirmed order is draft regardless of its lines", () => {
    const lines: LineQuantities[] = [{ qtyOrdered: 10, qtyReceived: 0, qtyBilled: 0 }];
    expect(deriveStatus(lines, false, false)).toBe("draft");
  });

  it("cancelled overrides everything else, even a partially received order", () => {
    const lines: LineQuantities[] = [{ qtyOrdered: 10, qtyReceived: 5, qtyBilled: 0 }];
    expect(deriveStatus(lines, true, true)).toBe("cancelled");
  });

  it("confirmed with nothing received yet is exactly \"confirmed\"", () => {
    const lines: LineQuantities[] = [{ qtyOrdered: 10, qtyReceived: 0, qtyBilled: 0 }];
    expect(deriveStatus(lines, false, true)).toBe("confirmed");
  });

  it("any receipt short of the full order is partially_received", () => {
    const lines: LineQuantities[] = [{ qtyOrdered: 10, qtyReceived: 1, qtyBilled: 0 }];
    expect(deriveStatus(lines, false, true)).toBe("partially_received");
  });

  it("fully received but not billed is \"received\"", () => {
    const lines: LineQuantities[] = [{ qtyOrdered: 10, qtyReceived: 10, qtyBilled: 0 }];
    expect(deriveStatus(lines, false, true)).toBe("received");
  });

  it("fully received AND fully billed is \"billed\"", () => {
    const lines: LineQuantities[] = [{ qtyOrdered: 10, qtyReceived: 10, qtyBilled: 10 }];
    expect(deriveStatus(lines, false, true)).toBe("billed");
  });

  it("multi-line orders derive from the SUM across lines, not any single line", () => {
    const lines: LineQuantities[] = [
      { qtyOrdered: 10, qtyReceived: 10, qtyBilled: 0 },
      { qtyOrdered: 5, qtyReceived: 0, qtyBilled: 0 },
    ];
    expect(deriveStatus(lines, false, true)).toBe("partially_received");
  });

  it("bill-what-is-ordered can be billed before it's received (advance billing / prepayment)", () => {
    const lines: LineQuantities[] = [{ qtyOrdered: 10, qtyReceived: 0, qtyBilled: 10 }];
    expect(deriveStatus(lines, false, true)).toBe("confirmed");
  });

  it("a confirmed order with zero lines does not throw and reads as confirmed", () => {
    expect(deriveStatus([], false, true)).toBe("confirmed");
  });
});

describe("line and order totals", () => {
  it("computes subtotal net of a percentage discount", () => {
    const subtotal = computeLineSubtotal({ qtyOrdered: 10, unitCost: 50, discountPct: 10, taxRate: 0 });
    expect(subtotal).toBe(450); // 500 - 10%
  });

  it("computes tax on the discounted subtotal, not the gross amount", () => {
    const totals = computeLineTotals({ qtyOrdered: 10, unitCost: 50, discountPct: 10, taxRate: 18 });
    expect(totals.subtotal).toBe(450);
    expect(totals.taxAmount).toBe(81); // 18% of 450
    expect(totals.total).toBe(531);
  });

  it("order totals sum every line independently", () => {
    const lineA = computeLineTotals({ qtyOrdered: 10, unitCost: 50, discountPct: 0, taxRate: 18 });
    const lineB = computeLineTotals({ qtyOrdered: 2, unitCost: 100, discountPct: 5, taxRate: 5 });
    const order = computeOrderTotals([lineA, lineB]);

    expect(order.subtotal).toBe(lineA.subtotal + lineB.subtotal);
    expect(order.taxAmount).toBe(lineA.taxAmount + lineB.taxAmount);
    expect(order.total).toBe(order.subtotal + order.taxAmount);
  });
});
