/**
 * Purchase order status derivation and line-total math — pure functions,
 * no database. The exact mirror of src/lib/sales/order-status.ts, applied
 * to the buying direction: header status is DERIVED from line quantities
 * (qtyOrdered/qtyReceived/qtyBilled), never a column a form sets directly.
 *
 * The service layer (src/server/procurement/orders.ts) calls deriveStatus()
 * after every mutation that changes a line's qtyReceived/qtyBilled and
 * writes the result to PurchaseOrder.status.
 */

export type PurchaseOrderStatus = "draft" | "confirmed" | "partially_received" | "received" | "billed" | "cancelled";

export interface LineQuantities {
  qtyOrdered: number;
  qtyReceived: number;
  qtyBilled: number;
}

/**
 * `cancelled` and `draft` are facts derivation cannot see — identical
 * reasoning to sales/order-status.ts's deriveStatus.
 */
export function deriveStatus(
  lines: LineQuantities[],
  isCancelled: boolean,
  isConfirmed: boolean
): PurchaseOrderStatus {
  if (isCancelled) return "cancelled";
  if (!isConfirmed) return "draft";
  if (lines.length === 0) return "confirmed";

  const totalOrdered = sum(lines, (l) => l.qtyOrdered);
  const totalReceived = sum(lines, (l) => l.qtyReceived);
  const totalBilled = sum(lines, (l) => l.qtyBilled);

  const fullyReceived = totalReceived >= totalOrdered && totalOrdered > 0;
  const fullyBilled = totalBilled >= totalOrdered && totalOrdered > 0;

  if (fullyReceived && fullyBilled) return "billed";
  if (fullyReceived) return "received";
  if (totalReceived > 0) return "partially_received";
  return "confirmed";
}

function sum<T>(items: T[], f: (item: T) => number): number {
  return items.reduce((acc, item) => acc + f(item), 0);
}

/* ------------------------------------------------------------------ */
/* Line and order totals                                               */
/* ------------------------------------------------------------------ */

export interface LinePricing {
  qtyOrdered: number;
  unitCost: number;
  discountPct: number;
  taxRate: number;
}

export interface LineTotals {
  subtotal: number;
  taxAmount: number;
  total: number;
}

export function computeLineSubtotal(line: LinePricing): number {
  const gross = line.qtyOrdered * line.unitCost;
  const discount = gross * (line.discountPct / 100);
  return round2(gross - discount);
}

export function computeLineTotals(line: LinePricing): LineTotals {
  const subtotal = computeLineSubtotal(line);
  const taxAmount = round2(subtotal * (line.taxRate / 100));
  return { subtotal, taxAmount, total: round2(subtotal + taxAmount) };
}

export function computeOrderTotals(lineTotals: LineTotals[]): LineTotals {
  return {
    subtotal: round2(sum(lineTotals, (l) => l.subtotal)),
    taxAmount: round2(sum(lineTotals, (l) => l.taxAmount)),
    total: round2(sum(lineTotals, (l) => l.total)),
  };
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
