"use client";

import * as React from "react";
import { useActionState } from "react";
import { AlertCircle } from "lucide-react";
import { PageHeader } from "@/components/erp/page-header";
import { FormSection } from "@/components/erp/field-grid";
import { LineItemsEditor, type EditableLine } from "@/components/erp/line-items-editor";
import { Input, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import type { SalesFormOptions } from "@/server/sales/options";
import { createSalesOrderAction, type ActionResult } from "../actions";

export function NewOrderForm({ options }: { options: SalesFormOptions }) {
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(createSalesOrderAction, { ok: false });
  const [lines, setLines] = React.useState<EditableLine[]>([]);
  const [partnerId, setPartnerId] = React.useState("");

  const customer = options.customers.find((c) => c.id === partnerId);
  const err = (field: string) => state.fieldErrors?.[field];

  return (
    <>
      <PageHeader title="New sales order" crumbs={[{ label: "Sales", href: "/app/sales" }, { label: "New order" }]} />

      <form action={formAction} className="flex-1 overflow-auto px-6 py-5">
        {/* Native forms have no repeating-group primitive, so the dynamic
            line array is serialised into one hidden JSON field on submit --
            see actions.ts's comment on why. */}
        <input type="hidden" name="lines" value={JSON.stringify(lines.map(stripKey))} />

        <FormSection title="Order details" className="pt-0">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="partnerId" required>
                Customer
              </Label>
              <Select id="partnerId" name="partnerId" required value={partnerId} onChange={(e) => setPartnerId(e.target.value)}>
                <option value="">Select a customer...</option>
                {options.customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
              {err("partnerId") ? <p className="text-2xs text-danger">{err("partnerId")}</p> : null}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="warehouseId" required>
                Warehouse
              </Label>
              <Select id="warehouseId" name="warehouseId" required defaultValue={options.warehouses[0]?.id ?? ""}>
                {options.warehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name} ({w.code})
                  </option>
                ))}
              </Select>
              {err("warehouseId") ? <p className="text-2xs text-danger">{err("warehouseId")}</p> : null}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="invoicingPolicy">Invoicing policy</Label>
              <Select id="invoicingPolicy" name="invoicingPolicy" defaultValue="invoice_delivered">
                <option value="invoice_delivered">Invoice what is delivered</option>
                <option value="invoice_ordered">Invoice what is ordered</option>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="expectedDeliveryDate">Expected delivery</Label>
              <Input id="expectedDeliveryDate" name="expectedDeliveryDate" type="date" />
            </div>
          </div>
        </FormSection>

        <FormSection title="Lines">
          <LineItemsEditor products={options.products} value={lines} onChange={setLines} currency={customer?.currency ?? undefined} />
          {err("lines") ? <p className="mt-2 text-2xs text-danger">{err("lines")}</p> : null}
        </FormSection>

        <FormSection title="Notes" className="pb-0">
          <Textarea name="notes" placeholder="Internal notes or terms for this order..." />
        </FormSection>

        {state.error ? (
          <div role="alert" className="mt-4 flex items-start gap-2 rounded-md border border-danger/20 bg-danger-soft px-3 py-2 text-xs text-danger">
            <AlertCircle className="mt-px size-3.5 shrink-0" />
            <span>{state.error}</span>
          </div>
        ) : null}

        <div className="mt-6 flex justify-end gap-2 border-t border-hairline pt-4">
          <Button type="submit" variant="primary" size="md" disabled={pending || lines.length === 0}>
            {pending ? "Creating..." : "Create order"}
          </Button>
        </div>
      </form>
    </>
  );
}

function stripKey(line: EditableLine) {
  const { key, ...rest } = line;
  void key;
  return rest;
}
