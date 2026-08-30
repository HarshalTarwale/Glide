/**
 * Order status derivation and line-total math — pure functions, no
 * database. Mirrors src/lib/tax/ and src/lib/inventory/avco.ts deliberately:
 * the one rule from Stage 1 research that must never drift (header status
 * is DERIVED from line quantities, never a column a form can set directly)
 * lives here, dependency-free, so a test can hammer it without Postgres.
 *
 * The service layer (src/server/sales/orders.ts) calls deriveStatus() after
 * every mutation that changes a line's qtyDelivered/qtyInvoiced and writes
 * the result to SalesOrder.status. That column is a cache, not a decision —
 * exactly the discipline StockQuant and StockValuationLayer already follow
 * in P2, with the same kind of reconciliation test as the guardrail.
 */

export type SalesOrderStatus =
  | "draft"
  | "confirmed"
  | "partially_delivered"
  | "delivered"
  | "invoiced"
  | "cancelled";

export interface LineQuantities {
  qtyOrdered: number;
  qtyDelivered: number;
  qtyInvoiced: number;
}

/**
 * `cancelled` is the one state derivation cannot see: nothing about a
 * cancelled order's quantities distinguishes it from a confirmed one that
 * just hasn't shipped yet. It is set explicitly by the cancel action and
 * passed in here as a fact, not inferred.
 *
 * `draft` is the same kind of fact: an order with zero delivered/invoiced
 * quantity is indistinguishable from "just confirmed, nothing shipped yet"
 * unless the caller says which one it is. Confirmation is what turns draft
 * into confirmed; everything after that IS derivable from quantities alone.
 */
export function deriveStatus(
  lines: LineQuantities[],
  isCancelled: boolean,
  isConfirmed: boolean
): SalesOrderStatus {
  if (isCancelled) return "cancelled";
  if (!isConfirmed) return "draft";
  if (lines.length === 0) return "confirmed";

  const totalOrdered = sum(lines, (l) => l.qtyOrdered);
  const totalDelivered = sum(lines, (l) => l.qtyDelivered);
  const totalInvoiced = sum(lines, (l) => l.qtyInvoiced);

  const fullyDelivered = totalDelivered >= totalOrdered && totalOrdered > 0;
  const fullyInvoiced = totalInvoiced >= totalOrdered && totalOrdered > 0;

  if (fullyDelivered && fullyInvoiced) return "invoiced";
  if (fullyDelivered) return "delivered";
  if (totalDelivered > 0) return "partially_delivered";
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
  unitPrice: number;
  discountPct: number;
  /** Percentage, e.g. 18 for 18%. Pre-resolved by the tax engine (P1). */
  taxRate: number;
}

export interface LineTotals {
  subtotal: number;
  taxAmount: number;
  total: number;
}

/** Net of discount, before tax. Rounded to money precision (2dp). */
export function computeLineSubtotal(line: LinePricing): number {
  const gross = line.qtyOrdered * line.unitPrice;
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
  return Math.round(n * 100) / 100;
}
