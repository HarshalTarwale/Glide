/** Demo data for the signed-out /app/payments list — see src/lib/mock/invoices.ts for the convention this follows. */

export interface DemoPayment extends Record<string, unknown> {
  id: string;
  number: string;
  partnerName: string;
  paymentDate: string;
  method: string;
  amount: number;
  currency: string;
  unallocatedAmount: number;
}

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

export const DEMO_PAYMENTS: DemoPayment[] = [
  { id: "demo-pay-1", number: "PAY-2026-0001", partnerName: "Acme Industrial Supplies", paymentDate: daysAgo(9), method: "bank_transfer", amount: 128400, currency: "INR", unallocatedAmount: 0 },
  { id: "demo-pay-2", number: "PAY-2026-0002", partnerName: "Nexa Retail Pvt Ltd", paymentDate: daysAgo(4), method: "card", amount: 30000, currency: "INR", unallocatedAmount: 0 },
  { id: "demo-pay-3", number: "PAY-2026-0003", partnerName: "Kite & Co Trading", paymentDate: daysAgo(1), method: "cheque", amount: 15000, currency: "INR", unallocatedAmount: 5250 },
];
