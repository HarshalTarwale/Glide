import { notFound } from "next/navigation";
import { getContext } from "@/server/context";
import { getPayment } from "@/server/invoicing/payments";
import { listOpenInvoicesForPartner } from "@/server/invoicing/invoices";
import { PaymentView } from "./payment-view";

export default async function PaymentPage({ params }: PageProps<"/app/payments/[id]">) {
  const { id } = await params;
  const ctx = await getContext();
  if (!ctx) notFound();

  const payment = await getPayment(ctx, id);
  if (!payment) notFound();

  const openInvoices = payment.unallocatedAmount > 0 ? await listOpenInvoicesForPartner(ctx, payment.partnerId) : [];

  return <PaymentView payment={payment} openInvoices={openInvoices} />;
}
