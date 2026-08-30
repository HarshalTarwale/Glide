"use client";

import * as React from "react";
import { useActionState } from "react";
import { AlertCircle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogBody,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import type { StockFormOptions } from "@/server/inventory/stock-options";
import type { ReorderRuleDTO } from "@/server/inventory/reorder-rules";
import { createReorderRuleAction, updateReorderRuleAction, type ActionResult } from "./actions";

export function ReorderRuleForm({
  open,
  onOpenChange,
  rule,
  options,
  warehouses,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Present = editing; absent = creating. */
  rule?: ReorderRuleDTO | null;
  options: StockFormOptions;
  warehouses: { id: string; code: string; name: string }[];
  onSaved: () => void;
}) {
  const isEdit = Boolean(rule);
  const action = isEdit ? updateReorderRuleAction.bind(null, rule!.id) : createReorderRuleAction;

  const [state, formAction, pending] = useActionState<ActionResult, FormData>(action, { ok: false });

  const prevOk = React.useRef(false);
  React.useEffect(() => {
    if (state.ok && !prevOk.current) {
      onOpenChange(false);
      onSaved();
    }
    prevOk.current = state.ok;
  }, [state.ok, onOpenChange, onSaved]);

  const err = (field: string) => state.fieldErrors?.[field];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit reorder rule" : "New reorder rule"}</DialogTitle>
          <DialogDescription>Flags this product when a warehouse&apos;s on-hand drops below the threshold.</DialogDescription>
        </DialogHeader>

        <form action={formAction}>
          <DialogBody className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="productId" required>
                Product
              </Label>
              {isEdit ? (
                <>
                  <input type="hidden" name="productId" value={rule!.productId} />
                  <Input value={`${rule!.productName} (${rule!.productSku})`} disabled />
                </>
              ) : (
                <Select id="productId" name="productId" required>
                  <option value="">Select a product...</option>
                  {options.products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.sku})
                    </option>
                  ))}
                </Select>
              )}
              {err("productId") ? <p className="text-2xs text-danger">{err("productId")}</p> : null}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="warehouseId" required>
                Warehouse
              </Label>
              {isEdit ? (
                <>
                  <input type="hidden" name="warehouseId" value={rule!.warehouseId} />
                  <Input value={rule!.warehouseName} disabled />
                </>
              ) : (
                <Select id="warehouseId" name="warehouseId" required>
                  <option value="">Select a warehouse...</option>
                  {warehouses.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name} ({w.code})
                    </option>
                  ))}
                </Select>
              )}
              {err("warehouseId") ? <p className="text-2xs text-danger">{err("warehouseId")}</p> : null}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="minQty" required>
                  Reorder point
                </Label>
                <Input id="minQty" name="minQty" type="number" min="0" step="0.000001" defaultValue={rule?.minQty} required className="tnum" />
                {err("minQty") ? <p className="text-2xs text-danger">{err("minQty")}</p> : null}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="maxQty">Reorder up to</Label>
                <Input id="maxQty" name="maxQty" type="number" min="0" step="0.000001" defaultValue={rule?.maxQty ?? ""} className="tnum" />
              </div>
            </div>

            {state.error ? (
              <div role="alert" className="flex items-start gap-2 rounded-md border border-danger/20 bg-danger-soft px-3 py-2 text-xs text-danger">
                <AlertCircle className="mt-px size-3.5 shrink-0" />
                <span>{state.error}</span>
              </div>
            ) : null}
          </DialogBody>

          <DialogFooter>
            <Button type="button" variant="ghost" size="md" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" size="md" disabled={pending}>
              {pending ? "Saving..." : isEdit ? "Save changes" : "Create rule"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
