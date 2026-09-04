"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Ban, CheckCircle2, FileText, Receipt, Truck } from "lucide-react";
import { PageHeader } from "@/components/erp/page-header";
import { RecordShell, RailSection, AuditTrail } from "@/components/erp/record-shell";
import { StatusStepper } from "@/components/erp/status-stepper";
import { SmartButtons } from "@/components/erp/smart-buttons";
import { LineItemsTable, type LineItem } from "@/components/erp/line-items";
import { FieldGrid, Field } from "@/components/erp/field-grid";
import { DateText } from "@/components/erp/money";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PermissionGate, useHasPermission } from "@/components/layout/session-context";
import type { PurchaseOrderDTO } from "@/server/procurement/orders";
import type { BillableOrderLineDTO } from "@/server/procurement/options";
import type { AuditEntryDTO } from "@/server/core/audit";
import { ReceiveDialog } from "./receive-dialog";
import { CreateBillDialog } from "./create-bill-dialog";
import { confirmPurchaseOrderAction, cancelPurchaseOrderAction } from "../../actions";

const STATUS_TONE: Record<string, "neutral" | "info" | "warning" | "accent" | "success" | "danger"> = {
  draft: "neutral",
  confirmed: "info",
  partially_received: "warning",
  received: "accent",
  billed: "success",
  cancelled: "danger",
};

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  confirmed: "Confirmed",
  partially_received: "Part. received",
  received: "Received",
  billed: "Billed",
  cancelled: "Cancelled",
};

const STEPS = [
  { id: "draft", label: "Draft" },
  { id: "confirmed", label: "Confirmed" },
  { id: "received", label: "Received" },
  { id: "billed", label: "Billed" },
];

export function OrderView({ order, audit, billableLines }: { order: PurchaseOrderDTO; audit: AuditEntryDTO[]; billableLines: BillableOrderLineDTO[] }) {
  const router = useRouter();
  const canWrite = useHasPermission("procurement:order:write");
  const canConfirm = useHasPermission("procurement:order:confirm");
  const canCancel = useHasPermission("procurement:order:cancel");
  const [receiveOpen, setReceiveOpen] = React.useState(false);
  const [billOpen, setBillOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  async function handleConfirm() {
    setBusy(true);
    const result = await confirmPurchaseOrderAction(order.id);
    setBusy(false);
    if (result.ok) {
      toast.success("Order confirmed");
      router.refresh();
    } else {
      toast.error(result.error ?? "Could not confirm the order");
    }
  }

  async function handleCancel() {
    setBusy(true);
    const result = await cancelPurchaseOrderAction(order.id);
    setBusy(false);
    if (result.ok) {
      toast.success("Order cancelled");
      router.refresh();
    } else {
      toast.error(result.error ?? "Could not cancel the order");
    }
  }

  function handleReceived() {
    toast.success("Receipt recorded");
    router.refresh();
  }

  const lines: LineItem[] = order.lines.map((l) => ({
    id: l.id,
    product: l.productName,
    sku: l.productSku,
    qty: l.qtyOrdered,
    uom: l.uomCode,
    unitPrice: l.unitCost,
    discountPct: l.discountPct,
    taxLabel: l.taxLabel,
    taxAmount: l.taxAmount,
    total: l.total,
  }));

  const taxBreakdown = order.taxComponents.map((c) => ({ label: c.label, amount: c.amount }));

  const stepId = order.status === "partially_received" ? "confirmed" : order.status;

  const canReceive = (order.status === "confirmed" || order.status === "partially_received") && order.lines.some((l) => l.qtyReceived < l.qtyOrdered);
  const canConfirmNow = order.status === "draft";
  const canCancelNow = order.status !== "cancelled" && order.status !== "billed" && order.receivedQty === 0;
  const canBillNow = (order.status === "confirmed" || order.status === "partially_received" || order.status === "received") && billableLines.length > 0;

  return (
    <RecordShell
      header={
        <PageHeader
          title={order.number}
          crumbs={[{ label: "Procurement", href: "/app/procurement/orders" }, { label: "Orders", href: "/app/procurement/orders" }, { label: order.number }]}
          status={
            <Badge tone={STATUS_TONE[order.status] ?? "neutral"} dot>
              {STATUS_LABEL[order.status] ?? order.status}
            </Badge>
          }
          meta={
            <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <span>{order.partnerName}</span>
              <span className="text-ink-subtle">·</span>
              <span>
                Ordered <DateText value={order.orderDate} />
              </span>
              {order.buyerName ? (
                <>
                  <span className="text-ink-subtle">·</span>
                  <span>{order.buyerName}</span>
                </>
              ) : null}
            </span>
          }
          actions={
            <>
              <StatusStepper steps={STEPS} current={stepId} cancelled={order.status === "cancelled"} className="mr-2 hidden xl:flex" />

              <PermissionGate permission="procurement:order:confirm">
                {canConfirmNow ? (
                  <Button variant="primary" size="md" onClick={handleConfirm} disabled={busy || !canConfirm}>
                    <CheckCircle2 />
                    Confirm
                  </Button>
                ) : null}
              </PermissionGate>

              <PermissionGate permission="procurement:receipt:write">
                {canReceive ? (
                  <Button variant="primary" size="md" onClick={() => setReceiveOpen(true)}>
                    <Truck />
                    Receive
                  </Button>
                ) : null}
              </PermissionGate>

              <PermissionGate permission="procurement:bill:write">
                {canBillNow ? (
                  <Button variant="secondary" size="md" onClick={() => setBillOpen(true)} disabled={!canWrite}>
                    <Receipt />
                    Create bill
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
            { label: "Received", value: `${order.receivedQty} / ${order.orderedQty}`, href: "#lines", icon: Truck },
            { label: "Bills", value: 0, href: "#lines", icon: Receipt },
            { label: "Documents", value: 0, href: "#notes", icon: FileText },
          ]}
        />
      }
      rail={
        <>
          <RailSection title="Details">
            <FieldGrid className="sm:grid-cols-1 gap-y-3">
              <Field label="Warehouse">{order.warehouseName}</Field>
              <Field label="Expected receipt">{order.expectedReceiptDate ? <DateText value={order.expectedReceiptDate} /> : "—"}</Field>
              <Field label="Billing policy">{order.billingPolicy === "bill_ordered" ? "Bill what is ordered" : "Bill what is received"}</Field>
              <Field label="Currency">{order.currency}</Field>
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
          <TabsTrigger value="lines">Order lines</TabsTrigger>
          <TabsTrigger value="receiving">Receiving</TabsTrigger>
          <TabsTrigger value="notes">Notes</TabsTrigger>
        </TabsList>

        <TabsContent value="lines">
          <LineItemsTable lines={lines} taxBreakdown={taxBreakdown} currency={order.currency} />
        </TabsContent>

        <TabsContent value="receiving">
          <FieldGrid>
            <Field label="Ordered">{order.orderedQty}</Field>
            <Field label="Received">{order.receivedQty}</Field>
            <Field label="Remaining">{order.orderedQty - order.receivedQty}</Field>
            <Field label="Warehouse">{order.warehouseName}</Field>
          </FieldGrid>
        </TabsContent>

        <TabsContent value="notes">
          <p className="text-sm text-ink-muted">{order.notes || "No notes on this order."}</p>
        </TabsContent>
      </Tabs>

      {canCancelNow ? (
        <PermissionGate permission="procurement:order:cancel">
          <div className="mt-8 flex justify-end border-t border-hairline pt-4">
            <Button variant="ghost" size="sm" className="text-danger hover:bg-danger-soft" onClick={handleCancel} disabled={busy || !canCancel}>
              <Ban />
              Cancel order
            </Button>
          </div>
        </PermissionGate>
      ) : null}

      <ReceiveDialog open={receiveOpen} onOpenChange={setReceiveOpen} orderId={order.id} lines={order.lines} onSaved={handleReceived} />
      <CreateBillDialog open={billOpen} onOpenChange={setBillOpen} orderId={order.id} lines={billableLines} />
    </RecordShell>
  );
}
