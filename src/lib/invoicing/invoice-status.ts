/**
 * Invoice status derivation, line/header totals, and AR aging — pure
 * functions, no database. Mirrors src/lib/sales/order-status.ts
 * deliberately: same discipline, applied to the next document down the
 * chain (order -> invoice -> payment).
 *
 * The service layer (src/server/invoicing/invoices.ts) calls
 * deriveInvoiceStatus() after every mutation that changes amountPaid and
 * writes the result to Invoice.status. That column is a cache, not a
 * decision.
 *
 * Credit notes are deliberately NOT folded into this derivation. A credit
 * note is a standalone reversal document against a specific invoice (see
 * docs/architecture.md §5.5) — it does not rewrite the invoice's own total
 * or its paid/unpaid status. It nets out separately in the AR aging report
 * (aggregate() below), the same way a real accounts-receivable ledger nets
 * invoices against credit memos per partner rather than mutating the
 * original invoice.
 */

export type InvoiceStatus = "draft" | "posted" | "partially_paid" | "paid" | "cancelled";

/**
 * `cancelled` and `draft` are facts derivation cannot see — the same
 * reasoning as SalesOrderStatus. Everything from `posted` onward IS
 * derivable from the total vs. what has actually been allocated to it.
 */
export function deriveInvoiceStatus(
  total: number,
  amountPaid: number,
  isCancelled: boolean,
  isPosted: boolean
): InvoiceStatus {
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
/* Line and header totals — identical shape to sales, independent copy: */
/* each document owns its own money math so a change to one never      */
/* silently reshapes the other.                                        */
/* ------------------------------------------------------------------ */

export interface InvoiceLinePricing {
  quantity: number;
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

export function computeInvoiceLineSubtotal(line: InvoiceLinePricing): number {
  const gross = line.quantity * line.unitPrice;
  const discount = gross * (line.discountPct / 100);
  return round2(gross - discount);
}

export function computeInvoiceLineTotals(line: InvoiceLinePricing): LineTotals {
  const subtotal = computeInvoiceLineSubtotal(line);
  const taxAmount = round2(subtotal * (line.taxRate / 100));
  return { subtotal, taxAmount, total: round2(subtotal + taxAmount) };
}

export function computeInvoiceTotals(lineTotals: LineTotals[]): LineTotals {
  return {
    subtotal: round2(sum(lineTotals, (l) => l.subtotal)),
    taxAmount: round2(sum(lineTotals, (l) => l.taxAmount)),
    total: round2(sum(lineTotals, (l) => l.total)),
  };
}

/* ------------------------------------------------------------------ */
/* Payment allocation                                                  */
/* ------------------------------------------------------------------ */

/**
 * A payment's unallocated remainder, after some amount of it has been
 * applied to one or more invoices. Never negative — the service layer must
 * reject an allocation that would overdraw the payment before it reaches
 * here; this function only does the arithmetic.
 */
export function computeUnallocated(paymentAmount: number, allocated: number): number {
  return round2(Math.max(0, paymentAmount - allocated));
}

/** An invoice's outstanding balance from payments alone (see file header re: credit notes). */
export function computeInvoiceOutstanding(total: number, amountPaid: number): number {
  return round2(Math.max(0, total - amountPaid));
}

/* ------------------------------------------------------------------ */
/* AR aging                                                            */
/* ------------------------------------------------------------------ */

export type AgingBucket = "current" | "1-30" | "31-60" | "61-90" | "90+";

export interface AgingLine {
  invoiceId: string;
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

/**
 * Days past due, floored at 0 (not-yet-due invoices are never negative
 * buckets — they land in "current" regardless of how far out the due date
 * is).
 */
export function ageBucket(dueDate: Date, asOf: Date): AgingBucket {
  const msPerDay = 24 * 60 * 60 * 1000;
  const daysPastDue = Math.floor((asOf.getTime() - dueDate.getTime()) / msPerDay);
  if (daysPastDue <= 0) return "current";
  if (daysPastDue <= 30) return "1-30";
  if (daysPastDue <= 60) return "31-60";
  if (daysPastDue <= 90) return "61-90";
  return "90+";
}

/** Buckets a set of outstanding invoice balances as of a given date. Only lines with outstanding > 0 contribute. */
export function aggregateAging(lines: AgingLine[], asOf: Date): AgingBucketTotals {
  const totals: AgingBucketTotals = {
    current: 0,
    "1-30": 0,
    "31-60": 0,
    "61-90": 0,
    "90+": 0,
    total: 0,
  };
  for (const line of lines) {
    if (line.outstanding <= 0) continue;
    const bucket = ageBucket(line.dueDate, asOf);
    totals[bucket] = round2(totals[bucket] + line.outstanding);
    totals.total = round2(totals.total + line.outstanding);
  }
  return totals;
}
