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
import type { InvoiceFormOptions } from "@/server/invoicing/options";
import { createStandaloneInvoiceAction, type ActionResult } from "../actions";

/**
 * A standalone invoice -- no sales order behind it. Invoicing FROM an order
 * happens on the order's own record page (see sales/[id]/invoice-dialog.tsx),
 * which draws lines from what the order still has left to invoice rather
 * than a free-form product picker.
 */
export function NewInvoiceForm({ options }: { options: InvoiceFormOptions }) {
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(createStandaloneInvoiceAction, { ok: false });
  const [lines, setLines] = React.useState<EditableLine[]>([]);
  const [partnerId, setPartnerId] = React.useState("");

  const customer = options.customers.find((c) => c.id === partnerId);
  const err = (field: string) => state.fieldErrors?.[field];

  const payload = lines.map((l) => ({
    productId: l.productId,
    quantity: l.qtyOrdered,
    unitPrice: l.unitPrice,
    discountPct: l.discountPct,
  }));

  return (
    <>
      <PageHeader title="New invoice" crumbs={[{ label: "Finance", href: "/app/invoices" }, { label: "Invoices", href: "/app/invoices" }, { label: "New invoice" }]} />

      <form action={formAction} className="flex-1 overflow-auto px-6 py-5">
        {/* Native forms have no repeating-group primitive, so the dynamic
            line array is serialised into one hidden JSON field on submit --
            see actions.ts's comment on why. */}
        <input type="hidden" name="lines" value={JSON.stringify(payload)} />

        <FormSection title="Invoice details" className="pt-0">
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
              <Label htmlFor="dueDate">Due date</Label>
              <Input id="dueDate" name="dueDate" type="date" />
            </div>
          </div>
        </FormSection>

        <FormSection title="Lines">
          <LineItemsEditor products={options.products} value={lines} onChange={setLines} currency={customer?.currency ?? undefined} />
          {err("lines") ? <p className="mt-2 text-2xs text-danger">{err("lines")}</p> : null}
        </FormSection>

        <FormSection title="Notes" className="pb-0">
          <Textarea name="notes" placeholder="Internal notes or terms for this invoice..." />
        </FormSection>

        {state.error ? (
          <div role="alert" className="mt-4 flex items-start gap-2 rounded-md border border-danger/20 bg-danger-soft px-3 py-2 text-xs text-danger">
            <AlertCircle className="mt-px size-3.5 shrink-0" />
            <span>{state.error}</span>
          </div>
        ) : null}

        <div className="mt-6 flex justify-end gap-2 border-t border-hairline pt-4">
          <Button type="submit" variant="primary" size="md" disabled={pending || lines.length === 0}>
            {pending ? "Creating..." : "Create invoice"}
          </Button>
        </div>
      </form>
    </>
  );
}
