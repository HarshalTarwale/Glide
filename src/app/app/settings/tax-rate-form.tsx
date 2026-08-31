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
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { COUNTRY_LIST } from "@/lib/i18n/countries";
import type { TaxRateDTO } from "@/server/core/tax-rates";
import { createTaxRateAction, updateTaxRateAction, type ActionResult } from "./actions";

export function TaxRateForm({
  open,
  onOpenChange,
  rate,
  defaultCountry,
  taxCategories,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Present = editing; absent = creating. */
  rate?: TaxRateDTO | null;
  defaultCountry: string;
  /** Real TaxCategory rows -- the select posts an actual category id, not
      the category "key" string (a distinct thing: several categories can
      theoretically share a key across tenants, but only the id is a valid
      foreign key). */
  taxCategories: { id: string; key: string; name: string }[];
  onSaved: () => void;
}) {
  const isEdit = Boolean(rate);
  const action = isEdit ? updateTaxRateAction.bind(null, rate!.id) : createTaxRateAction;
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
          <DialogTitle>{isEdit ? "Edit tax rate" : "New tax rate"}</DialogTitle>
          <DialogDescription>
            US sales tax stacks state + county + city rates on the same order. Other regimes use one rate per category.
          </DialogDescription>
        </DialogHeader>

        <form action={formAction}>
          <DialogBody className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="name" required>
                Name
              </Label>
              <Input id="name" name="name" defaultValue={rate?.name} placeholder="Texas state, GST 18%..." required />
              {err("name") ? <p className="text-2xs text-danger">{err("name")}</p> : null}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="country" required>
                  Country
                </Label>
                <Select id="country" name="country" defaultValue={rate?.country ?? defaultCountry} required>
                  {COUNTRY_LIST.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="region">State / region</Label>
                <Input id="region" name="region" defaultValue={rate?.region ?? ""} placeholder="Leave blank for national" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="rate" required>
                  Rate (%)
                </Label>
                <Input id="rate" name="rate" type="number" min="0" max="100" step="0.01" defaultValue={rate?.rate} required className="tnum" />
                {err("rate") ? <p className="text-2xs text-danger">{err("rate")}</p> : null}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="level">Level</Label>
                <Select id="level" name="level" defaultValue={rate?.level ?? "national"}>
                  <option value="national">National</option>
                  <option value="state">State</option>
                  <option value="county">County</option>
                  <option value="city">City</option>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="taxCategoryId">Applies to category</Label>
              <Select id="taxCategoryId" name="taxCategoryId" defaultValue={rate?.categoryKey ? taxCategories.find((c) => c.key === rate.categoryKey)?.id ?? "" : ""}>
                <option value="">All categories (US-style jurisdiction rate)</option>
                {taxCategories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </div>

            <label className="flex items-center gap-2 text-sm text-ink">
              <Checkbox name="isActive" defaultChecked={rate?.isActive ?? true} />
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
              {pending ? "Saving..." : isEdit ? "Save changes" : "Create rate"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
