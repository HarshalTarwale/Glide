"use client";

import { use } from "react";
import { notFound } from "next/navigation";
import { Ban, FileDown, Printer, Receipt, Truck } from "lucide-react";
import { PageHeader } from "@/components/erp/page-header";
import { RecordShell, RailSection, AuditTrail } from "@/components/erp/record-shell";
import { StatusStepper } from "@/components/erp/status-stepper";
import { SmartButtons } from "@/components/erp/smart-buttons";
import { LineItemsTable, type LineItem } from "@/components/erp/line-items";
import { FieldGrid, Field } from "@/components/erp/field-grid";
import { Money, DateText, Code } from "@/components/erp/money";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useFormatContext } from "@/components/erp/format-context";
import { getCountry } from "@/lib/i18n/countries";
import { SALES_ORDERS, SALES_ORDER_STEPS, STATUS_META } from "@/lib/mock/sales-orders";

export default function SalesOrderPage({ params }: PageProps<"/app/sales/[id]">) {
  const { id } = use(params);
  const order = SALES_ORDERS.find((o) => o.id === id);
  if (!order) notFound();

  const ctx = useFormatContext();
  const pack = getCountry(ctx.country);
  const meta = STATUS_META[order.status];

  // Tax presentation is country-driven. India splits an intra-state supply
  // into CGST + SGST; every other regime here shows a single line.
  const taxBreakdown =
    pack.taxRegime === "GST_IN"
      ? [
          { label: "CGST 9%", amount: order.tax / 2 },
          { label: "SGST 9%", amount: order.tax / 2 },
        ]
      : [{ label: `${pack.taxLabel} 18%`, amount: order.tax }];

  const lines: LineItem[] = [
    {
      id: "l1",
      product: "Industrial Bearing 6204-ZZ",
      sku: "BRG-6204ZZ",
      qty: Math.round(order.qtyOrdered * 0.6),
      uom: "pcs",
      unitPrice: 340,
      discountPct: 0,
      taxLabel: pack.taxRegime === "GST_IN" ? "GST 18%" : `${pack.taxLabel} 18%`,
      taxAmount: order.tax * 0.6,
      total: order.subtotal * 0.6,
    },
    {
      id: "l2",
      product: "Drive Belt A-42 (Heavy Duty)",
      sku: "BLT-A42HD",
      qty: Math.round(order.qtyOrdered * 0.4),
      uom: "pcs",
      unitPrice: 615,
      discountPct: 5,
      taxLabel: pack.taxRegime === "GST_IN" ? "GST 18%" : `${pack.taxLabel} 18%`,
      taxAmount: order.tax * 0.4,
      total: order.subtotal * 0.4,
    },
  ];

  const stepId =
    order.status === "partially_delivered"
      ? "confirmed"
      : order.status === "cancelled"
        ? "draft"
        : order.status;

  return (
    <RecordShell
      header={
        <PageHeader
          title={order.number}
          crumbs={[{ label: "Sales", href: "/app/sales" }, { label: "Orders", href: "/app/sales" }, { label: order.number }]}
          status={<Badge tone={meta.tone} dot>{meta.label}</Badge>}
          meta={
            <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <span>{order.customer}</span>
              <span className="text-ink-subtle">·</span>
              <span>
                Ordered <DateText value={order.orderDate} />
              </span>
              <span className="text-ink-subtle">·</span>
              <span>{order.salesperson}</span>
            </span>
          }
          actions={
            <>
              {/* Actions are driven by the state machine. An invoiced order
                  never offers "Confirm"; a cancelled one offers nothing. */}
              <StatusStepper
                steps={SALES_ORDER_STEPS}
                current={stepId}
                cancelled={order.status === "cancelled"}
                className="mr-2 hidden xl:flex"
              />
              <Button variant="secondary" size="md">
                <Printer />
                Print
              </Button>
              {order.status === "confirmed" || order.status === "partially_delivered" ? (
                <Button variant="primary" size="md">
                  <Truck />
                  Deliver
                </Button>
              ) : null}
              {order.status === "delivered" ? (
                <Button variant="primary" size="md">
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
            { label: "Deliveries", value: order.qtyDelivered > 0 ? 1 : 0, href: "#", icon: Truck },
            { label: "Invoices", value: order.qtyInvoiced > 0 ? 1 : 0, href: "#", icon: Receipt },
            { label: "Documents", value: 2, href: "#", icon: FileDown },
          ]}
        />
      }
      rail={
        <>
          <RailSection title="Details">
            <FieldGrid className="sm:grid-cols-1 gap-y-3">
              <Field label="Warehouse">{order.warehouse}</Field>
              <Field label="Delivery date">
                <DateText value={order.deliveryDate} />
              </Field>
              <Field label={pack.taxIdLabel}>
                <Code className="text-xs">27AABCU9603R1ZX</Code>
              </Field>
              <Field label="Currency">{pack.currency}</Field>
            </FieldGrid>
          </RailSection>
          <RailSection title="Activity">
            <AuditTrail
              entries={[
                { id: "a1", actor: order.salesperson, action: "confirmed the order", at: "2 hours ago" },
                { id: "a2", actor: order.salesperson, action: "changed delivery date", at: "Yesterday" },
                { id: "a3", actor: "System", action: "reserved stock for 2 lines", at: "Yesterday" },
                { id: "a4", actor: "R. Menon", action: "created the quotation", at: "12 Aug 2026" },
              ]}
            />
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
          <LineItemsTable lines={lines} taxBreakdown={taxBreakdown} />
        </TabsContent>

        <TabsContent value="delivery">
          <FieldGrid>
            <Field label="Ordered">{order.qtyOrdered} pcs</Field>
            <Field label="Delivered">{order.qtyDelivered} pcs</Field>
            <Field label="Remaining">{order.qtyOrdered - order.qtyDelivered} pcs</Field>
            <Field label="Warehouse">{order.warehouse}</Field>
          </FieldGrid>
        </TabsContent>

        <TabsContent value="invoicing">
          <FieldGrid>
            <Field label="Invoicing policy">Invoice what is delivered</Field>
            <Field label="Invoiced quantity">{order.qtyInvoiced} pcs</Field>
            <Field label="Invoiced amount">
              <Money value={(order.qtyInvoiced / order.qtyOrdered) * order.total || 0} />
            </Field>
            <Field label="Outstanding">
              <Money value={order.total - ((order.qtyInvoiced / order.qtyOrdered) * order.total || 0)} />
            </Field>
          </FieldGrid>
        </TabsContent>

        <TabsContent value="notes">
          <p className="text-sm text-ink-muted">
            Internal notes and customer-facing terms will live here.
          </p>
        </TabsContent>
      </Tabs>

      {order.status !== "cancelled" ? (
        <div className="mt-8 flex justify-end border-t border-hairline pt-4">
          <Button variant="ghost" size="sm" className="text-danger hover:bg-danger-soft">
            <Ban />
            Cancel order
          </Button>
        </div>
      ) : null}
    </RecordShell>
  );
}
