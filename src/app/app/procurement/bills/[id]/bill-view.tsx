"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Ban, CheckCircle2, CreditCard, Receipt, Wallet } from "lucide-react";
import { PageHeader } from "@/components/erp/page-header";
import { RecordShell, RailSection, AuditTrail } from "@/components/erp/record-shell";
import { StatusStepper } from "@/components/erp/status-stepper";
import { SmartButtons } from "@/components/erp/smart-buttons";
import { LineItemsTable, type LineItem } from "@/components/erp/line-items";
import { FieldGrid, Field } from "@/components/erp/field-grid";
import { DateText } from "@/components/erp/money";
import { useFormatContext } from "@/components/erp/format-context";
import { formatMoney } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PermissionGate, useHasPermission } from "@/components/layout/session-context";
import type { BillDTO } from "@/server/procurement/bills";
import type { AuditEntryDTO } from "@/server/core/audit";
import { RecordPaymentDialog } from "./record-payment-dialog";
import { postBillAction, cancelBillAction } from "../../actions";

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

export function BillView({ bill, audit }: { bill: BillDTO; audit: AuditEntryDTO[] }) {
  const router = useRouter();
  const fmt = useFormatContext();
  const money = (v: number) => formatMoney(v, { ...fmt, currency: bill.currency });
  const canPost = useHasPermission("procurement:bill:post");
  const canCancel = useHasPermission("procurement:bill:cancel");
  const [paymentOpen, setPaymentOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  async function handlePost() {
    setBusy(true);
    const result = await postBillAction(bill.id);
    setBusy(false);
    if (result.ok) {
      toast.success("Bill posted");
      router.refresh();
    } else {
      toast.error(result.error ?? "Could not post the bill");
    }
  }

  async function handleCancel() {
    setBusy(true);
    const result = await cancelBillAction(bill.id);
    setBusy(false);
    if (result.ok) {
      toast.success("Bill cancelled");
      router.refresh();
    } else {
      toast.error(result.error ?? "Could not cancel the bill");
    }
  }

  const lines: LineItem[] = bill.lines.map((l) => ({
    id: l.id,
    product: l.productName,
    sku: l.productSku,
    qty: l.quantity,
    uom: l.uomCode,
    unitPrice: l.unitCost,
    discountPct: l.discountPct,
    taxLabel: l.taxLabel,
    taxAmount: l.taxAmount,
    total: l.total,
  }));

  const taxBreakdown = bill.taxComponents.map((c) => ({ label: c.label, amount: c.amount }));
  const stepId = bill.status === "partially_paid" ? "posted" : bill.status;

  const isDraft = bill.status === "draft";
  const isPosted = bill.status === "posted" || bill.status === "partially_paid" || bill.status === "paid";
  const canPayNow = isPosted && bill.outstanding > 0;

  return (
    <RecordShell
      header={
        <PageHeader
          title={bill.number}
          crumbs={[{ label: "Procurement", href: "/app/procurement/bills" }, { label: "Bills", href: "/app/procurement/bills" }, { label: bill.number }]}
          status={
            <Badge tone={STATUS_TONE[bill.status] ?? "neutral"} dot>
              {STATUS_LABEL[bill.status] ?? bill.status}
            </Badge>
          }
          meta={
            <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <span>{bill.partnerName}</span>
              <span className="text-ink-subtle">·</span>
              <span>
                Billed <DateText value={bill.billDate} />
              </span>
              {bill.purchaseOrderNumber ? (
                <>
                  <span className="text-ink-subtle">·</span>
                  <Link href={`/app/procurement/orders/${bill.purchaseOrderId}`} className="text-accent hover:underline">
                    {bill.purchaseOrderNumber}
                  </Link>
                </>
              ) : null}
            </span>
          }
          actions={
            <>
              <StatusStepper steps={STEPS} current={stepId} cancelled={bill.status === "cancelled"} className="mr-2 hidden xl:flex" />

              <PermissionGate permission="procurement:bill:post">
                {isDraft ? (
                  <Button variant="primary" size="md" onClick={handlePost} disabled={busy || !canPost}>
                    <CheckCircle2 />
                    Post
                  </Button>
                ) : null}
              </PermissionGate>

              <PermissionGate permission="procurement:payment:write">
                {canPayNow ? (
                  <Button variant="primary" size="md" onClick={() => setPaymentOpen(true)}>
                    <Wallet />
                    Record payment
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
            { label: "Total", value: money(bill.total), href: "#lines", icon: Receipt },
            { label: "Paid", value: money(bill.amountPaid), href: "#payments", icon: Wallet },
            { label: "Outstanding", value: money(bill.outstanding), href: "#payments", icon: CreditCard },
          ]}
        />
      }
      rail={
        <>
          <RailSection title="Details">
            <FieldGrid className="sm:grid-cols-1 gap-y-3">
              <Field label="Currency">{bill.currency}</Field>
              <Field label="Due date">{bill.dueDate ? <DateText value={bill.dueDate} /> : "—"}</Field>
              <Field label="Posted">{bill.postedAt ? <DateText value={bill.postedAt} /> : "Not yet posted"}</Field>
              {bill.purchaseOrderNumber ? (
                <Field label="Purchase order">
                  <Link href={`/app/procurement/orders/${bill.purchaseOrderId}`} className="text-accent hover:underline">
                    {bill.purchaseOrderNumber}
                  </Link>
                </Field>
              ) : null}
            </FieldGrid>
          </RailSection>
          <RailSection title="Activity">
            {audit.length > 0 ? (
              <AuditTrail entries={audit.map((a) => ({ id: a.id, actor: a.actorName, action: a.action, at: new Date(a.at).toLocaleString() }))} />
            ) : (
              <p className="text-xs text-ink-subtle">No activity yet.</p>
            )}
          </RailSection>
        </>
      }
    >
      <Tabs defaultValue="lines">
        <TabsList>
          <TabsTrigger value="lines">Bill lines</TabsTrigger>
          <TabsTrigger value="notes">Notes</TabsTrigger>
        </TabsList>

        <TabsContent value="lines">
          <LineItemsTable lines={lines} taxBreakdown={taxBreakdown} currency={bill.currency} />
          {isDraft ? (
            <p className="mt-3 text-2xs text-ink-subtle">This bill is still a draft — lines can be changed until it is posted. Once posted, it is immutable.</p>
          ) : null}
        </TabsContent>

        <TabsContent value="notes">
          <p className="text-sm text-ink-muted">{bill.notes || "No notes on this bill."}</p>
        </TabsContent>
      </Tabs>

      {isDraft ? (
        <PermissionGate permission="procurement:bill:cancel">
          <div className="mt-8 flex justify-end border-t border-hairline pt-4">
            <Button variant="ghost" size="sm" className="text-danger hover:bg-danger-soft" onClick={handleCancel} disabled={busy || !canCancel}>
              <Ban />
              Cancel bill
            </Button>
          </div>
        </PermissionGate>
      ) : null}

      <RecordPaymentDialog
        open={paymentOpen}
        onOpenChange={setPaymentOpen}
        partnerId={bill.partnerId}
        partnerName={bill.partnerName}
        preselectedBill={{ id: bill.id, number: bill.number, outstanding: bill.outstanding }}
        currency={bill.currency}
        onSaved={() => {
          toast.success("Payment recorded");
          router.refresh();
        }}
      />
    </RecordShell>
  );
}
