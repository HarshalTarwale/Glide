"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Ban, CheckCircle2, CreditCard, FileDown, FileMinus2, Receipt, Wallet } from "lucide-react";
import { PageHeader } from "@/components/erp/page-header";
import { RecordShell, RailSection, AuditTrail } from "@/components/erp/record-shell";
import { StatusStepper } from "@/components/erp/status-stepper";
import { SmartButtons } from "@/components/erp/smart-buttons";
import { LineItemsTable, type LineItem } from "@/components/erp/line-items";
import { FieldGrid, Field } from "@/components/erp/field-grid";
import { Money, DateText } from "@/components/erp/money";
import { useFormatContext } from "@/components/erp/format-context";
import { formatMoney } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PermissionGate, useHasPermission } from "@/components/layout/session-context";
import type { InvoiceDTO } from "@/server/invoicing/invoices";
import type { CreditNoteDTO } from "@/server/invoicing/credit-notes";
import type { AuditEntryDTO } from "@/server/core/audit";
import { CreditNoteDialog } from "./credit-note-dialog";
import { RecordPaymentDialog } from "./record-payment-dialog";
import { postInvoiceAction, cancelInvoiceAction } from "../actions";

const STATUS_TONE: Record<string, "neutral" | "info" | "warning" | "accent" | "success" | "danger"> = {
  draft: "neutral",
  posted: "info",
  partially_paid: "warning",
  paid: "success",
  cancelled: "danger",
};

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  posted: "Posted",
  partially_paid: "Part. paid",
  paid: "Paid",
  cancelled: "Cancelled",
};

const STEPS = [
  { id: "draft", label: "Draft" },
  { id: "posted", label: "Posted" },
  { id: "paid", label: "Paid" },
];

export function InvoiceView({
  invoice,
  audit,
  creditNotes,
}: {
  invoice: InvoiceDTO;
  audit: AuditEntryDTO[];
  creditNotes: CreditNoteDTO[];
}) {
  const router = useRouter();
  const fmt = useFormatContext();
  const money = (v: number) => formatMoney(v, { ...fmt, currency: invoice.currency });
  const canPost = useHasPermission("invoicing:invoice:post");
  const canCancel = useHasPermission("invoicing:invoice:cancel");
  const [creditNoteOpen, setCreditNoteOpen] = React.useState(false);
  const [paymentOpen, setPaymentOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  async function handlePost() {
    setBusy(true);
    const result = await postInvoiceAction(invoice.id);
    setBusy(false);
    if (result.ok) {
      toast.success("Invoice posted");
      router.refresh();
    } else {
      toast.error(result.error ?? "Could not post the invoice");
    }
  }

  async function handleCancel() {
    setBusy(true);
    const result = await cancelInvoiceAction(invoice.id);
    setBusy(false);
    if (result.ok) {
      toast.success("Invoice cancelled");
      router.refresh();
    } else {
      toast.error(result.error ?? "Could not cancel the invoice");
    }
  }

  function handleSaved(message: string) {
    toast.success(message);
    router.refresh();
  }

  const lines: LineItem[] = invoice.lines.map((l) => ({
    id: l.id,
    product: l.productName,
    sku: l.productSku,
    qty: l.quantity,
    uom: l.uomCode,
    unitPrice: l.unitPrice,
    discountPct: l.discountPct,
    taxLabel: l.taxLabel,
    taxAmount: l.taxAmount,
    total: l.total,
  }));

  const taxBreakdown = invoice.taxComponents.map((c) => ({ label: c.label, amount: c.amount }));

  // partially_paid maps onto the "posted" step -- the linear stepper shows
  // where the document is in its lifecycle, not every intermediate status.
  const stepId = invoice.status === "partially_paid" ? "posted" : invoice.status;

  const isDraft = invoice.status === "draft";
  const isPosted = invoice.status === "posted" || invoice.status === "partially_paid" || invoice.status === "paid";
  const canCreditNow = isPosted;
  const canPayNow = isPosted && invoice.outstanding > 0;

  const totalCredited = creditNotes.reduce((s, c) => s + c.total, 0);

  return (
    <RecordShell
      header={
        <PageHeader
          title={invoice.number}
          crumbs={[{ label: "Finance", href: "/app/invoices" }, { label: "Invoices", href: "/app/invoices" }, { label: invoice.number }]}
          status={
            <Badge tone={STATUS_TONE[invoice.status] ?? "neutral"} dot>
              {STATUS_LABEL[invoice.status] ?? invoice.status}
            </Badge>
          }
          meta={
            <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <span>{invoice.partnerName}</span>
              <span className="text-ink-subtle">·</span>
              <span>
                Issued <DateText value={invoice.invoiceDate} />
              </span>
              {invoice.salesOrderNumber ? (
                <>
                  <span className="text-ink-subtle">·</span>
                  <Link href={`/app/sales/${invoice.salesOrderId}`} className="text-accent hover:underline">
                    {invoice.salesOrderNumber}
                  </Link>
                </>
              ) : null}
            </span>
          }
          actions={
            <>
              <StatusStepper steps={STEPS} current={stepId} cancelled={invoice.status === "cancelled"} className="mr-2 hidden xl:flex" />

              <Button variant="secondary" size="md" asChild>
                <a href={`/api/invoices/${invoice.id}/pdf`} target="_blank" rel="noopener noreferrer">
                  <FileDown />
                  PDF
                </a>
              </Button>

              <PermissionGate permission="invoicing:invoice:post">
                {isDraft ? (
                  <Button variant="primary" size="md" onClick={handlePost} disabled={busy || !canPost}>
                    <CheckCircle2 />
                    Post
                  </Button>
                ) : null}
              </PermissionGate>

              <PermissionGate permission="invoicing:payment:write">
                {canPayNow ? (
                  <Button variant="primary" size="md" onClick={() => setPaymentOpen(true)}>
                    <Wallet />
                    Record payment
                  </Button>
                ) : null}
              </PermissionGate>

              <PermissionGate permission="invoicing:creditnote:write">
                {canCreditNow ? (
                  <Button variant="secondary" size="md" onClick={() => setCreditNoteOpen(true)}>
                    <FileMinus2 />
                    Credit note
                  </Button>
                ) : null}
              </PermissionGate>
            </>
          }
        />
      }
      smartButtons={
        <SmartButtons
          items={[
            { label: "Total", value: money(invoice.total), href: "#lines", icon: Receipt },
            { label: "Paid", value: money(invoice.amountPaid), href: "#payments", icon: Wallet },
            { label: "Outstanding", value: money(invoice.outstanding), href: "#payments", icon: CreditCard },
            { label: "Credit notes", value: creditNotes.length, href: "#credits", icon: FileMinus2 },
          ]}
        />
      }
      rail={
        <>
          <RailSection title="Details">
            <FieldGrid className="sm:grid-cols-1 gap-y-3">
              <Field label="Currency">{invoice.currency}</Field>
              <Field label="Due date">{invoice.dueDate ? <DateText value={invoice.dueDate} /> : "—"}</Field>
              <Field label="Posted">{invoice.postedAt ? <DateText value={invoice.postedAt} /> : "Not yet posted"}</Field>
              {invoice.salesOrderNumber ? (
                <Field label="Sales order">
                  <Link href={`/app/sales/${invoice.salesOrderId}`} className="text-accent hover:underline">
                    {invoice.salesOrderNumber}
                  </Link>
                </Field>
              ) : null}
            </FieldGrid>
          </RailSection>
          <RailSection title="Activity">
            {audit.length > 0 ? (
              <AuditTrail
                entries={audit.map((a) => ({
                  id: a.id,
                  actor: a.actorName,
                  action: a.action,
                  at: new Date(a.at).toLocaleString(),
                }))}
              />
            ) : (
              <p className="text-xs text-ink-subtle">No activity yet.</p>
            )}
          </RailSection>
        </>
      }
    >
      <Tabs defaultValue="lines">
        <TabsList>
          <TabsTrigger value="lines">Invoice lines</TabsTrigger>
          <TabsTrigger value="credits">Credit notes</TabsTrigger>
          <TabsTrigger value="notes">Notes</TabsTrigger>
        </TabsList>

        <TabsContent value="lines">
          <LineItemsTable lines={lines} taxBreakdown={taxBreakdown} currency={invoice.currency} />
          {isDraft ? (
            <p className="mt-3 text-2xs text-ink-subtle">
              This invoice is still a draft — lines can be changed until it is posted. Once posted, a correction requires a credit note.
            </p>
          ) : null}
        </TabsContent>

        <TabsContent value="credits">
          {creditNotes.length === 0 ? (
            <p className="text-sm text-ink-muted">No credit notes issued against this invoice.</p>
          ) : (
            <div className="overflow-hidden rounded-lg border border-hairline">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-hairline bg-surface-sunken text-2xs uppercase tracking-wide text-ink-subtle">
                    <th className="px-3 py-2 text-left font-semibold">Number</th>
                    <th className="px-3 py-2 text-left font-semibold">Date</th>
                    <th className="px-3 py-2 text-left font-semibold">Reason</th>
                    <th className="px-3 py-2 text-right font-semibold">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {creditNotes.map((c) => (
                    <tr key={c.id} className="h-row border-b border-hairline last:border-0">
                      <td className="px-3 font-medium text-ink">{c.number}</td>
                      <td className="px-3 text-ink-muted">
                        <DateText value={c.creditNoteDate} />
                      </td>
                      <td className="px-3 text-ink-muted">{c.reason}</td>
                      <td className="px-3 text-right">
                        <Money value={c.total} currency={invoice.currency} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="flex justify-end border-t border-hairline px-3 py-2 text-xs text-ink-muted">
                Total credited: <Money value={totalCredited} currency={invoice.currency} className="ml-1 font-medium" />
              </div>
            </div>
          )}
        </TabsContent>

        <TabsContent value="notes">
          <p className="text-sm text-ink-muted">{invoice.notes || "No notes on this invoice."}</p>
        </TabsContent>
      </Tabs>

      {isDraft ? (
        <PermissionGate permission="invoicing:invoice:cancel">
          <div className="mt-8 flex justify-end border-t border-hairline pt-4">
            <Button variant="ghost" size="sm" className="text-danger hover:bg-danger-soft" onClick={handleCancel} disabled={busy || !canCancel}>
              <Ban />
              Cancel invoice
            </Button>
          </div>
        </PermissionGate>
      ) : null}

      <CreditNoteDialog
        open={creditNoteOpen}
        onOpenChange={setCreditNoteOpen}
        invoiceId={invoice.id}
        lines={invoice.lines}
        currency={invoice.currency}
        onSaved={() => handleSaved("Credit note issued")}
      />

      <RecordPaymentDialog
        open={paymentOpen}
        onOpenChange={setPaymentOpen}
        partnerId={invoice.partnerId}
        partnerName={invoice.partnerName}
        preselectedInvoice={{ id: invoice.id, number: invoice.number, outstanding: invoice.outstanding }}
        currency={invoice.currency}
        onSaved={() => handleSaved("Payment recorded")}
      />
    </RecordShell>
  );
}
