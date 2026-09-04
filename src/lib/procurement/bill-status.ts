/**
 * Bill status derivation, line/header totals, payment allocation and AP
 * aging — pure functions, no database. The exact mirror of
 * src/lib/invoicing/invoice-status.ts, applied to the buying direction.
 *
 * The service layer (src/server/procurement/bills.ts) calls
 * deriveBillStatus() after every mutation that changes amountPaid and
 * writes the result to Bill.status.
 */

export type BillStatus = "draft" | "posted" | "partially_paid" | "paid" | "cancelled";

export function deriveBillStatus(
  total: number,
  amountPaid: number,
  isCancelled: boolean,
  isPosted: boolean
): BillStatus {
  if (isCancelled) return "cancelled";
  if (!isPosted) return "draft";
  if (total > 0 && amountPaid >= total) return "paid";
  if (amountPaid > 0) return "partially_paid";
  return "posted";
}

function sum<T>(items: T[], f: (item: T) => number): number {
  return items.reduce((acc, item) => acc + f(item), 0);
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/* ------------------------------------------------------------------ */
/* Line and header totals                                              */
/* ------------------------------------------------------------------ */

export interface BillLinePricing {
  quantity: number;
  unitCost: number;
  discountPct: number;
  taxRate: number;
}

export interface LineTotals {
  subtotal: number;
  taxAmount: number;
  total: number;
}

export function computeBillLineSubtotal(line: BillLinePricing): number {
  const gross = line.quantity * line.unitCost;
  const discount = gross * (line.discountPct / 100);
  return round2(gross - discount);
}

export function computeBillLineTotals(line: BillLinePricing): LineTotals {
  const subtotal = computeBillLineSubtotal(line);
  const taxAmount = round2(subtotal * (line.taxRate / 100));
  return { subtotal, taxAmount, total: round2(subtotal + taxAmount) };
}

export function computeBillTotals(lineTotals: LineTotals[]): LineTotals {
  return {
    subtotal: round2(sum(lineTotals, (l) => l.subtotal)),
    taxAmount: round2(sum(lineTotals, (l) => l.taxAmount)),
    total: round2(sum(lineTotals, (l) => l.total)),
  };
}

/* ------------------------------------------------------------------ */
/* Payment allocation                                                  */
/* ------------------------------------------------------------------ */

export function computeUnallocated(paymentAmount: number, allocated: number): number {
  return round2(Math.max(0, paymentAmount - allocated));
}

export function computeBillOutstanding(total: number, amountPaid: number): number {
  return round2(Math.max(0, total - amountPaid));
}

/* ------------------------------------------------------------------ */
/* AP aging — the exact mirror of invoice-status.ts's AR aging.        */
/* ------------------------------------------------------------------ */

export type AgingBucket = "current" | "1-30" | "31-60" | "61-90" | "90+";

export interface AgingLine {
  billId: string;
  partnerId: string;
  dueDate: Date;
  outstanding: number;
}

export interface AgingBucketTotals {
  current: number;
  "1-30": number;
  "31-60": number;
  "61-90": number;
  "90+": number;
  total: number;
}

export function ageBucket(dueDate: Date, asOf: Date): AgingBucket {
  const msPerDay = 24 * 60 * 60 * 1000;
  const daysPastDue = Math.floor((asOf.getTime() - dueDate.getTime()) / msPerDay);
  if (daysPastDue <= 0) return "current";
  if (daysPastDue <= 30) return "1-30";
  if (daysPastDue <= 60) return "31-60";
  if (daysPastDue <= 90) return "61-90";
  return "90+";
}

export function aggregateAging(lines: AgingLine[], asOf: Date): AgingBucketTotals {
  const totals: AgingBucketTotals = { current: 0, "1-30": 0, "31-60": 0, "61-90": 0, "90+": 0, total: 0 };
  for (const line of lines) {
    if (line.outstanding <= 0) continue;
    const bucket = ageBucket(line.dueDate, asOf);
    totals[bucket] = round2(totals[bucket] + line.outstanding);
    totals.total = round2(totals.total + line.outstanding);
  }
  return totals;
}
