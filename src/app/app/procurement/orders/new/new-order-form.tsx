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
import type { ProcurementFormOptions } from "@/server/procurement/options";
import { createPurchaseOrderAction, type ActionResult } from "../../actions";

export function NewOrderForm({ options }: { options: ProcurementFormOptions }) {
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(createPurchaseOrderAction, { ok: false });
  const [lines, setLines] = React.useState<EditableLine[]>([]);
  const [partnerId, setPartnerId] = React.useState("");

  const supplier = options.suppliers.find((s) => s.id === partnerId);
  const err = (field: string) => state.fieldErrors?.[field];

  // LineItemsEditor is Sales' component (its "salesPrice" field name is
  // literal) -- reused here with each product's COST in that slot, since
  // a purchase order prices against what we pay, not what we charge.
  const purchaseProducts = options.products.map((p) => ({ id: p.id, sku: p.sku, name: p.name, salesPrice: p.costPrice, uomCode: p.uomCode }));

  const payload = lines.map((l) => ({ productId: l.productId, qtyOrdered: l.qtyOrdered, unitCost: l.unitPrice, discountPct: l.discountPct }));

  return (
    <>
      <PageHeader title="New purchase order" crumbs={[{ label: "Procurement", href: "/app/procurement/orders" }, { label: "Orders", href: "/app/procurement/orders" }, { label: "New order" }]} />

      <form action={formAction} className="flex-1 overflow-auto px-6 py-5">
        <input type="hidden" name="lines" value={JSON.stringify(payload)} />

        <FormSection title="Order details" className="pt-0">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="partnerId" required>
                Supplier
              </Label>
              <Select id="partnerId" name="partnerId" required value={partnerId} onChange={(e) => setPartnerId(e.target.value)}>
                <option value="">Select a supplier...</option>
                {options.suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
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
              <Label htmlFor="billingPolicy">Billing policy</Label>
              <Select id="billingPolicy" name="billingPolicy" defaultValue="bill_received">
                <option value="bill_received">Bill what is received</option>
                <option value="bill_ordered">Bill what is ordered</option>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="expectedReceiptDate">Expected receipt</Label>
              <Input id="expectedReceiptDate" name="expectedReceiptDate" type="date" />
            </div>
          </div>
        </FormSection>

        <FormSection title="Lines">
          <LineItemsEditor products={purchaseProducts} value={lines} onChange={setLines} currency={supplier?.currency ?? undefined} />
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
