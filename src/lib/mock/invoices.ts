/**
 * Demo data for the signed-out /app/invoices list, same convention as
 * src/lib/mock/sales-orders.ts and src/lib/mock/products.ts: realistic
 * content (real-looking customer names, a spread of statuses and ages) so
 * the screen reads like a product, not a lorem-ipsum shell, when nobody is
 * signed in.
 */

export interface DemoInvoice extends Record<string, unknown> {
  id: string;
  number: string;
  status: "draft" | "posted" | "partially_paid" | "paid" | "cancelled";
  partnerName: string;
  invoiceDate: string;
  dueDate: string | null;
  total: number;
  amountPaid: number;
  outstanding: number;
}

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

export const DEMO_INVOICES: DemoInvoice[] = [
  { id: "demo-inv-1", number: "INV-2026-0001", status: "paid", partnerName: "Acme Industrial Supplies", invoiceDate: daysAgo(40), dueDate: daysAgo(10), total: 128400, amountPaid: 128400, outstanding: 0 },
  { id: "demo-inv-2", number: "INV-2026-0002", status: "partially_paid", partnerName: "Nexa Retail Pvt Ltd", invoiceDate: daysAgo(35), dueDate: daysAgo(5), total: 64200, amountPaid: 30000, outstanding: 34200 },
  { id: "demo-inv-3", number: "INV-2026-0003", status: "posted", partnerName: "Vertex Manufacturing", invoiceDate: daysAgo(20), dueDate: daysAgo(-10), total: 212500, amountPaid: 0, outstanding: 212500 },
  { id: "demo-inv-4", number: "INV-2026-0004", status: "posted", partnerName: "Orbit Logistics", invoiceDate: daysAgo(75), dueDate: daysAgo(45), total: 18900, amountPaid: 0, outstanding: 18900 },
  { id: "demo-inv-5", number: "INV-2026-0005", status: "draft", partnerName: "Kite & Co Trading", invoiceDate: daysAgo(1), dueDate: null, total: 9750, amountPaid: 0, outstanding: 9750 },
  { id: "demo-inv-6", number: "INV-2026-0006", status: "cancelled", partnerName: "Solstice Retail Group", invoiceDate: daysAgo(50), dueDate: daysAgo(20), total: 45300, amountPaid: 0, outstanding: 0 },
];
