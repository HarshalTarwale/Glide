import { notFound } from "next/navigation";
import { getContext } from "@/server/context";
import { getInvoice } from "@/server/invoicing/invoices";
import { listCreditNotesForInvoice } from "@/server/invoicing/credit-notes";
import { getAuditTrail } from "@/server/core/audit";
import { InvoiceView } from "./invoice-view";

export default async function InvoicePage({ params }: PageProps<"/app/invoices/[id]">) {
  const { id } = await params;
  const ctx = await getContext();
  if (!ctx) notFound();

  const invoice = await getInvoice(ctx, id);
  if (!invoice) notFound();

  const [audit, creditNotes] = await Promise.all([
    getAuditTrail(ctx, "Invoice", invoice.id),
    listCreditNotesForInvoice(ctx, invoice.id),
  ]);

  return <InvoiceView invoice={invoice} audit={audit} creditNotes={creditNotes} />;
}
