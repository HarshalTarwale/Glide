import { describe, expect, it } from "vitest";
import {
  deriveStatus,
  computeLineSubtotal,
  computeLineTotals,
  computeOrderTotals,
  type LineQuantities,
} from "@/lib/sales/order-status";

describe("deriveStatus — the Stage 1 non-negotiable rule", () => {
  it("an unconfirmed order is draft regardless of its lines", () => {
    const lines: LineQuantities[] = [{ qtyOrdered: 10, qtyDelivered: 0, qtyInvoiced: 0 }];
    expect(deriveStatus(lines, false, false)).toBe("draft");
  });

  it("cancelled overrides everything else, even a partially delivered order", () => {
    const lines: LineQuantities[] = [{ qtyOrdered: 10, qtyDelivered: 5, qtyInvoiced: 0 }];
    expect(deriveStatus(lines, true, true)).toBe("cancelled");
  });

  it("confirmed with nothing delivered yet is exactly \"confirmed\"", () => {
    const lines: LineQuantities[] = [{ qtyOrdered: 10, qtyDelivered: 0, qtyInvoiced: 0 }];
    expect(deriveStatus(lines, false, true)).toBe("confirmed");
  });

  it("any delivery short of the full order is partially_delivered", () => {
    const lines: LineQuantities[] = [{ qtyOrdered: 10, qtyDelivered: 1, qtyInvoiced: 0 }];
    expect(deriveStatus(lines, false, true)).toBe("partially_delivered");
  });

  it("fully delivered but not invoiced is \"delivered\"", () => {
    const lines: LineQuantities[] = [{ qtyOrdered: 10, qtyDelivered: 10, qtyInvoiced: 0 }];
    expect(deriveStatus(lines, false, true)).toBe("delivered");
  });

  it("fully delivered AND fully invoiced is \"invoiced\"", () => {
    const lines: LineQuantities[] = [{ qtyOrdered: 10, qtyDelivered: 10, qtyInvoiced: 10 }];
    expect(deriveStatus(lines, false, true)).toBe("invoiced");
  });

  it("multi-line orders derive from the SUM across lines, not any single line", () => {
    // Line A fully delivered, line B not started -- the order as a whole is
    // only partially delivered, even though line A alone looks "done".
    const lines: LineQuantities[] = [
      { qtyOrdered: 10, qtyDelivered: 10, qtyInvoiced: 0 },
      { qtyOrdered: 5, qtyDelivered: 0, qtyInvoiced: 0 },
    ];
    expect(deriveStatus(lines, false, true)).toBe("partially_delivered");
  });

  it("an invoice-what-is-ordered line can be invoiced before it ships (advance invoicing)", () => {
    // qtyInvoiced can legitimately exceed qtyDelivered under the
    // invoice_ordered policy (architecture.md §5.4) -- fully invoiced but
    // not yet delivered must NOT be reported as "invoiced" (that name is
    // reserved for the terminal state), so it should read as "confirmed".
    const lines: LineQuantities[] = [{ qtyOrdered: 10, qtyDelivered: 0, qtyInvoiced: 10 }];
    expect(deriveStatus(lines, false, true)).toBe("confirmed");
  });

  it("a confirmed order with zero lines does not throw and reads as confirmed", () => {
    expect(deriveStatus([], false, true)).toBe("confirmed");
  });
});

describe("line and order totals", () => {
  it("computes subtotal net of a percentage discount", () => {
    const subtotal = computeLineSubtotal({ qtyOrdered: 10, unitPrice: 100, discountPct: 10, taxRate: 0 });
    expect(subtotal).toBe(900); // 1000 - 10%
  });

  it("computes tax on the discounted subtotal, not the gross amount", () => {
    const totals = computeLineTotals({ qtyOrdered: 10, unitPrice: 100, discountPct: 10, taxRate: 18 });
    expect(totals.subtotal).toBe(900);
    expect(totals.taxAmount).toBe(162); // 18% of 900, not of 1000
    expect(totals.total).toBe(1062);
  });

  it("a zero discount and zero tax round-trips exactly", () => {
    const totals = computeLineTotals({ qtyOrdered: 3, unitPrice: 19.99, discountPct: 0, taxRate: 0 });
    expect(totals.subtotal).toBe(59.97);
    expect(totals.total).toBe(59.97);
  });

  it("order totals sum every line independently", () => {
    const lineA = computeLineTotals({ qtyOrdered: 10, unitPrice: 100, discountPct: 0, taxRate: 18 });
    const lineB = computeLineTotals({ qtyOrdered: 2, unitPrice: 50, discountPct: 5, taxRate: 5 });
    const order = computeOrderTotals([lineA, lineB]);

    expect(order.subtotal).toBe(lineA.subtotal + lineB.subtotal);
    expect(order.taxAmount).toBe(lineA.taxAmount + lineB.taxAmount);
    expect(order.total).toBe(order.subtotal + order.taxAmount);
  });
});
