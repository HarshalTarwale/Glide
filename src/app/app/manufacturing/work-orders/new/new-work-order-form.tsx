"use client";

import { useActionState } from "react";
import { AlertCircle } from "lucide-react";
import { PageHeader } from "@/components/erp/page-header";
import { FormSection } from "@/components/erp/field-grid";
import { Input, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { createWorkOrderAction, type ActionResult } from "../../actions";

export function NewWorkOrderForm({
  boms,
  warehouses,
}: {
  boms: { id: string; productId: string; productName: string }[];
  warehouses: { id: string; name: string }[];
}) {
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(createWorkOrderAction, { ok: false });
  const err = (field: string) => state.fieldErrors?.[field];

  return (
    <>
      <PageHeader title="New work order" crumbs={[{ label: "Manufacturing" }, { label: "Work Orders", href: "/app/manufacturing/work-orders" }, { label: "New work order" }]} />

      <form action={formAction} className="flex-1 overflow-auto px-6 py-5">
        <FormSection title="Work order details" className="pt-0">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="bomId" required>
                Bill of materials
              </Label>
              <Select id="bomId" name="bomId" required defaultValue="">
                <option value="" disabled>
                  Select a BOM...
                </option>
                {boms.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.productName}
                  </option>
                ))}
              </Select>
              {err("bomId") ? <p className="text-2xs text-danger">{err("bomId")}</p> : null}
              {boms.length === 0 ? <p className="text-2xs text-ink-subtle">No active BOMs yet -- create one first.</p> : null}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="warehouseId" required>
                Warehouse
              </Label>
              <Select id="warehouseId" name="warehouseId" required defaultValue={warehouses[0]?.id ?? ""}>
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </Select>
              {err("warehouseId") ? <p className="text-2xs text-danger">{err("warehouseId")}</p> : null}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="quantity" required>
                Quantity to produce
              </Label>
              <Input id="quantity" name="quantity" type="number" min="0.000001" step="any" defaultValue={1} className="tnum" required />
              {err("quantity") ? <p className="text-2xs text-danger">{err("quantity")}</p> : null}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="scheduledDate">Scheduled date</Label>
              <Input id="scheduledDate" name="scheduledDate" type="date" />
            </div>
          </div>
        </FormSection>

        <FormSection title="Notes" className="pb-0">
          <Textarea name="notes" placeholder="Optional" />
        </FormSection>

        {state.error ? (
          <div role="alert" className="mt-4 flex items-start gap-2 rounded-md border border-danger/20 bg-danger-soft px-3 py-2 text-xs text-danger">
            <AlertCircle className="mt-px size-3.5 shrink-0" />
            <span>{state.error}</span>
          </div>
        ) : null}

        <div className="mt-6 flex justify-end gap-2 border-t border-hairline pt-4">
          <Button type="submit" variant="primary" size="md" disabled={pending || boms.length === 0}>
            {pending ? "Creating..." : "Create work order"}
          </Button>
        </div>
      </form>
    </>
  );
}
