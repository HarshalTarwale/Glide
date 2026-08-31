"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Split } from "lucide-react";
import { PageHeader } from "@/components/erp/page-header";
import { RecordShell, RailSection } from "@/components/erp/record-shell";
import { FieldGrid, Field } from "@/components/erp/field-grid";
import { Money, DateText, Code } from "@/components/erp/money";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PermissionGate } from "@/components/layout/session-context";
import type { PaymentDTO } from "@/server/invoicing/payments";
import type { OpenInvoiceDTO } from "@/server/invoicing/invoices";
import { AllocateDialog } from "./allocate-dialog";

const METHOD_LABEL: Record<string, string> = {
  bank_transfer: "Bank transfer",
  card: "Card",
  cash: "Cash",
  cheque: "Cheque",
  other: "Other",
};

export function PaymentView({ payment, openInvoices }: { payment: PaymentDTO; openInvoices: OpenInvoiceDTO[] }) {
  const router = useRouter();
  const [allocateOpen, setAllocateOpen] = React.useState(false);

  return (
    <RecordShell
      header={
        <PageHeader
          title={payment.number}
          crumbs={[{ label: "Finance", href: "/app/invoices" }, { label: "Payments", href: "/app/payments" }, { label: payment.number }]}
          status={
            payment.unallocatedAmount > 0 ? (
              <Badge tone="warning" dot>
                Partially applied
              </Badge>
            ) : (
              <Badge tone="success" dot>
                Fully applied
              </Badge>
            )
          }
          meta={
            <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <span>{payment.partnerName}</span>
              <span className="text-ink-subtle">·</span>
              <span>
                Received <DateText value={payment.paymentDate} />
              </span>
            </span>
          }
          actions={
            <PermissionGate permission="invoicing:payment:write">
              {payment.unallocatedAmount > 0 ? (
                <Button variant="primary" size="md" onClick={() => setAllocateOpen(true)}>
                  <Split />
                  Allocate remaining
                </Button>
              ) : null}
            </PermissionGate>
          }
        />
      }
      rail={
        <RailSection title="Details">
          <FieldGrid className="sm:grid-cols-1 gap-y-3">
            <Field label="Method">{METHOD_LABEL[payment.method] ?? payment.method}</Field>
            <Field label="Reference">{payment.reference ?? "—"}</Field>
            <Field label="Amount">
              <Money value={payment.amount} currency={payment.currency} />
            </Field>
            <Field label="Unallocated">
              <Money value={payment.unallocatedAmount} currency={payment.currency} />
            </Field>
          </FieldGrid>
        </RailSection>
      }
    >
      <div className="overflow-hidden rounded-lg border border-hairline">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-hairline bg-surface-sunken text-2xs uppercase tracking-wide text-ink-subtle">
              <th className="px-3 py-2 text-left font-semibold">Invoice</th>
              <th className="px-3 py-2 text-right font-semibold">Applied</th>
            </tr>
          </thead>
          <tbody>
            {payment.allocations.length === 0 ? (
              <tr>
                <td colSpan={2} className="px-3 py-6 text-center text-sm text-ink-subtle">
                  This payment has not been applied to any invoice yet.
                </td>
              </tr>
            ) : (
              payment.allocations.map((a) => (
                <tr key={a.id} className="h-row border-b border-hairline last:border-0">
                  <td className="px-3">
                    <Link href={`/app/invoices/${a.invoiceId}`} className="text-accent hover:underline">
                      <Code>{a.invoiceNumber}</Code>
                    </Link>
                  </td>
                  <td className="px-3 text-right">
                    <Money value={a.amount} currency={payment.currency} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {payment.notes ? <p className="mt-4 text-sm text-ink-muted">{payment.notes}</p> : null}

      <AllocateDialog
        open={allocateOpen}
        onOpenChange={setAllocateOpen}
        paymentId={payment.id}
        openInvoices={openInvoices}
        unallocatedAmount={payment.unallocatedAmount}
        currency={payment.currency}
        onSaved={() => {
          toast.success("Payment allocated");
          router.refresh();
        }}
      />
    </RecordShell>
  );
}
