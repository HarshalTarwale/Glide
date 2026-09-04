import { notFound } from "next/navigation";
import { getContext } from "@/server/context";
import { getBillPayment } from "@/server/procurement/bill-payments";
import { getOpenBillsForPartner } from "@/server/procurement/bill-payments";
import { PaymentView } from "./payment-view";

export default async function BillPaymentPage({ params }: PageProps<"/app/procurement/payments/[id]">) {
  const { id } = await params;
  const ctx = await getContext();
  if (!ctx) notFound();

  const payment = await getBillPayment(ctx, id);
  if (!payment) notFound();

  const openBills = payment.unallocatedAmount > 0 ? await getOpenBillsForPartner(ctx, payment.partnerId) : [];

  return <PaymentView payment={payment} openBills={openBills} />;
}
