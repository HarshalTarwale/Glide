"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Ban, CheckCircle2, FileDown, Receipt, Truck } from "lucide-react";
import { PageHeader } from "@/components/erp/page-header";
import { RecordShell, RailSection, AuditTrail } from "@/components/erp/record-shell";
import { StatusStepper } from "@/components/erp/status-stepper";
import { SmartButtons } from "@/components/erp/smart-buttons";
import { LineItemsTable, type LineItem } from "@/components/erp/line-items";
import { FieldGrid, Field } from "@/components/erp/field-grid";
import { Money, DateText } from "@/components/erp/money";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PermissionGate, useHasPermission } from "@/components/layout/session-context";
import type { SalesOrderDTO } from "@/server/sales/orders";
import type { AuditEntryDTO } from "@/server/core/audit";
import { DeliverDialog } from "./deliver-dialog";
import { confirmSalesOrderAction, cancelSalesOrderAction } from "../actions";

const STATUS_TONE: Record<string, "neutral" | "info" | "warning" | "accent" | "success" | "danger"> = {
  draft: "neutral",
  confirmed: "info",
  partially_delivered: "warning",
  delivered: "accent",
  invoiced: "success",
  cancelled: "danger",
};

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  confirmed: "Confirmed",
  partially_delivered: "Part. delivered",
  delivered: "Delivered",
  invoiced: "Invoiced",
  cancelled: "Cancelled",
};

const STEPS = [
  { id: "draft", label: "Draft" },
  { id: "confirmed", label: "Confirmed" },
  { id: "delivered", label: "Delivered" },
  { id: "invoiced", label: "Invoiced" },
];

export function SalesOrderView({ order, audit }: { order: SalesOrderDTO; audit: AuditEntryDTO[] }) {
  const router = useRouter();
  const canWrite = useHasPermission("sales:order:write");
  const canConfirm = useHasPermission("sales:order:confirm");
  const canCancel = useHasPermission("sales:order:cancel");
  const [deliverOpen, setDeliverOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  async function handleConfirm() {
    setBusy(true);
    const result = await confirmSalesOrderAction(order.id);
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
    const result = await cancelSalesOrderAction(order.id);
    setBusy(false);
    if (result.ok) {
      toast.success("Order cancelled");
      router.refresh();
    } else {
      toast.error(result.error ?? "Could not cancel the order");
    }
  }

  function handleDelivered() {
    toast.success("Delivery recorded");
    router.refresh();
  }

  const lines: LineItem[] = order.lines.map((l) => ({
    id: l.id,
    product: l.productName,
    sku: l.productSku,
    qty: l.qtyOrdered,
    uom: l.uomCode,
    unitPrice: l.unitPrice,
    discountPct: l.discountPct,
    taxLabel: l.taxLabel,
    taxAmount: l.taxAmount,
    total: l.total,
  }));

  const taxBreakdown = order.taxComponents.map((c) => ({ label: c.label, amount: c.amount }));

  // Same shape StatusStepper already expects (Stage 2): cancelled is
  // rendered as its own terminal badge, everything else maps onto the
  // linear draft -> confirmed -> delivered -> invoiced progression.
  const stepId = order.status === "partially_delivered" ? "confirmed" : order.status;

  const canDeliver = (order.status === "confirmed" || order.status === "partially_delivered") && order.lines.some((l) => l.qtyDelivered < l.qtyOrdered);
  const canConfirmNow = order.status === "draft";
  const canCancelNow = order.status !== "cancelled" && order.status !== "invoiced" && order.deliveredQty === 0;

  return (
    <RecordShell
      header={
        <PageHeader
          title={order.number}
          crumbs={[{ label: "Sales", href: "/app/sales" }, { label: "Orders", href: "/app/sales" }, { label: order.number }]}
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
              {order.salespersonName ? (
                <>
                  <span className="text-ink-subtle">·</span>
                  <span>{order.salespersonName}</span>
                </>
              ) : null}
            </span>
          }
          actions={
            <>
              <StatusStepper steps={STEPS} current={stepId} cancelled={order.status === "cancelled"} className="mr-2 hidden xl:flex" />

              <PermissionGate permission="sales:order:confirm">
                {canConfirmNow ? (
                  <Button variant="primary" size="md" onClick={handleConfirm} disabled={busy || !canConfirm}>
                    <CheckCircle2 />
                    Confirm
                  </Button>
                ) : null}
              </PermissionGate>

              <PermissionGate permission="sales:order:write">
                {canDeliver ? (
                  <Button variant="primary" size="md" onClick={() => setDeliverOpen(true)} disabled={!canWrite}>
                    <Truck />
                    Deliver
                  </Button>
                ) : null}
              </PermissionGate>

              {order.status === "delivered" ? (
                <Button variant="secondary" size="md" disabled title="Invoicing arrives in P4">
                  <Receipt />
                  Create invoice
                </Button>
              ) : null}
            </>
          }
        />
      }
      smartButtons={
        <SmartButtons
          items={[
            { label: "Delivered", value: `${order.deliveredQty} / ${order.orderedQty}`, href: "#delivery", icon: Truck },
            { label: "Invoices", value: 0, href: "#invoicing", icon: Receipt },
            { label: "Documents", value: 0, href: "#notes", icon: FileDown },
          ]}
        />
      }
      rail={
        <>
          <RailSection title="Details">
            <FieldGrid className="sm:grid-cols-1 gap-y-3">
              <Field label="Warehouse">{order.warehouseName}</Field>
              <Field label="Expected delivery">
                {order.expectedDeliveryDate ? <DateText value={order.expectedDeliveryDate} /> : "—"}
              </Field>
              <Field label="Invoicing policy">
                {order.invoicingPolicy === "invoice_ordered" ? "Invoice what is ordered" : "Invoice what is delivered"}
              </Field>
              <Field label="Currency">{order.currency}</Field>
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
          <TabsTrigger value="lines">Order lines</TabsTrigger>
          <TabsTrigger value="delivery">Delivery</TabsTrigger>
          <TabsTrigger value="invoicing">Invoicing</TabsTrigger>
          <TabsTrigger value="notes">Notes</TabsTrigger>
        </TabsList>

        <TabsContent value="lines">
          <LineItemsTable lines={lines} taxBreakdown={taxBreakdown} currency={order.currency} />
        </TabsContent>

        <TabsContent value="delivery">
          <FieldGrid>
            <Field label="Ordered">{order.orderedQty}</Field>
            <Field label="Delivered">{order.deliveredQty}</Field>
            <Field label="Remaining">{order.orderedQty - order.deliveredQty}</Field>
            <Field label="Warehouse">{order.warehouseName}</Field>
          </FieldGrid>
        </TabsContent>

        <TabsContent value="invoicing">
          <FieldGrid>
            <Field label="Invoicing policy">
              {order.invoicingPolicy === "invoice_ordered" ? "Invoice what is ordered" : "Invoice what is delivered"}
            </Field>
            <Field label="Order total">
              <Money value={order.total} currency={order.currency} />
            </Field>
            <Field label="Invoiced">Invoicing arrives in P4</Field>
          </FieldGrid>
        </TabsContent>

        <TabsContent value="notes">
          <p className="text-sm text-ink-muted">{order.notes || "No notes on this order."}</p>
        </TabsContent>
      </Tabs>

      {canCancelNow ? (
        <PermissionGate permission="sales:order:cancel">
          <div className="mt-8 flex justify-end border-t border-hairline pt-4">
            <Button variant="ghost" size="sm" className="text-danger hover:bg-danger-soft" onClick={handleCancel} disabled={busy || !canCancel}>
              <Ban />
              Cancel order
            </Button>
          </div>
        </PermissionGate>
      ) : null}

      <DeliverDialog
        open={deliverOpen}
        onOpenChange={setDeliverOpen}
        orderId={order.id}
        lines={order.lines}
        onSaved={handleDelivered}
      />
    </RecordShell>
  );
}
