"use client";

import * as React from "react";
import { useActionState } from "react";
import { AlertCircle, Plus, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogBody,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import type { BomDTO } from "@/server/manufacturing/boms";
import { createBomAction, updateBomAction, type ActionResult } from "../actions";

interface LineRow {
  key: string;
  componentProductId: string;
  quantity: number;
}

export function BomForm({
  open,
  onOpenChange,
  bom,
  products,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bom: BomDTO | null;
  products: { id: string; name: string; sku: string }[];
  onSaved: () => void;
}) {
  const action = bom ? updateBomAction.bind(null, bom.id) : createBomAction;
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(action, { ok: false });
  const [isActive, setIsActive] = React.useState(bom?.isActive ?? true);
  const [lines, setLines] = React.useState<LineRow[]>([]);

  const prevOk = React.useRef(false);
  React.useEffect(() => {
    if (state.ok && !prevOk.current) {
      onOpenChange(false);
      onSaved();
    }
    prevOk.current = state.ok;
  }, [state.ok, onOpenChange, onSaved]);

  // Reset local state whenever the dialog opens for a (possibly different)
  // BOM -- adjusted during render, the same pattern account-form.tsx uses.
  const [wasOpenFor, setWasOpenFor] = React.useState<string | null>(null);
  const openKey = open ? (bom?.id ?? "__new__") : null;
  if (openKey !== wasOpenFor) {
    setWasOpenFor(openKey);
    if (openKey !== null) {
      setIsActive(bom?.isActive ?? true);
      setLines(bom ? bom.lines.map((l) => ({ key: l.id, componentProductId: l.componentProductId, quantity: l.quantity })) : []);
    }
  }

  function addLine() {
    setLines((ls) => [...ls, { key: crypto.randomUUID(), componentProductId: "", quantity: 1 }]);
  }
  function removeLine(key: string) {
    setLines((ls) => ls.filter((l) => l.key !== key));
  }
  function updateLine(key: string, patch: Partial<LineRow>) {
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  const payload = lines.filter((l) => l.componentProductId).map((l) => ({ componentProductId: l.componentProductId, quantity: l.quantity }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{bom ? "Edit bill of materials" : "New bill of materials"}</DialogTitle>
          <DialogDescription>Component quantities are per this BOM&apos;s batch -- a work order scales them to whatever quantity it produces.</DialogDescription>
        </DialogHeader>

        <form action={formAction}>
          <input type="hidden" name="lines" value={JSON.stringify(payload)} />

          <DialogBody className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="productId" required>
                  Output product
                </Label>
                <Select id="productId" name="productId" defaultValue={bom?.productId ?? ""} required>
                  <option value="" disabled>
                    Select a product...
                  </option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </Select>
                {state.fieldErrors?.productId ? <p className="text-2xs text-danger">{state.fieldErrors.productId}</p> : null}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="quantity" required>
                  Batch quantity
                </Label>
                <Input id="quantity" name="quantity" type="number" min="0.000001" step="any" defaultValue={bom?.quantity ?? 1} className="tnum" required />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Components</Label>
              {lines.length === 0 ? <p className="text-xs text-ink-subtle">No components added yet.</p> : null}
              {lines.map((l) => (
                <div key={l.key} className="flex items-center gap-2">
                  <Select value={l.componentProductId} onChange={(e) => updateLine(l.key, { componentProductId: e.target.value })} className="flex-1">
                    <option value="" disabled>
                      Select a component...
                    </option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.sku})
                      </option>
                    ))}
                  </Select>
                  <Input
                    type="number"
                    min="0.000001"
                    step="any"
                    value={l.quantity}
                    onChange={(e) => updateLine(l.key, { quantity: Number(e.target.value) || 0 })}
                    className="h-8 w-24 text-right text-xs tnum"
                  />
                  <Button type="button" variant="ghost" size="iconSm" aria-label="Remove component" onClick={() => removeLine(l.key)}>
                    <Trash2 className="text-ink-subtle" />
                  </Button>
                </div>
              ))}
              <Button type="button" variant="ghost" size="sm" onClick={addLine}>
                <Plus />
                Add component
              </Button>
              {state.fieldErrors?.lines ? <p className="text-2xs text-danger">{state.fieldErrors.lines}</p> : null}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="notes">Notes</Label>
              <Textarea id="notes" name="notes" defaultValue={bom?.notes ?? ""} placeholder="Optional" />
            </div>

            <label className="flex items-center gap-2 text-sm text-ink">
              <Checkbox checked={isActive} onCheckedChange={(checked) => setIsActive(checked === true)} />
              <input type="hidden" name="isActive" value={isActive ? "on" : ""} />
              Active
            </label>

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
              {pending ? "Saving..." : bom ? "Save changes" : "Create BOM"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
