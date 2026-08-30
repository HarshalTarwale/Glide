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
import { COUNTRY_LIST } from "@/lib/i18n/countries";
import type { WarehouseDTO } from "@/server/inventory/warehouses";
import { createWarehouseAction, updateWarehouseAction, type ActionResult } from "./actions";

export function WarehouseForm({
  open,
  onOpenChange,
  warehouse,
  defaultCountry,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Present = editing; absent = creating. */
  warehouse?: WarehouseDTO | null;
  defaultCountry: string;
  onSaved: () => void;
}) {
  const isEdit = Boolean(warehouse);
  const action = isEdit ? updateWarehouseAction.bind(null, warehouse!.id) : createWarehouseAction;

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
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit warehouse" : "New warehouse"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? `Editing ${warehouse!.name}`
              : "A stock location is created automatically for it."}
          </DialogDescription>
        </DialogHeader>

        <form action={formAction}>
          <DialogBody className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Code" htmlFor="code" error={err("code")} required>
                {/* Disabled fields are excluded from FormData by the browser,
                    so a hidden mirror carries the value through on edit --
                    the visible field stays disabled for the "code is the
                    identity, don't casually rename it" UX, without silently
                    failing validation on every save. */}
                {isEdit ? <input type="hidden" name="code" value={warehouse!.code} /> : null}
                <Input
                  id="code"
                  name={isEdit ? undefined : "code"}
                  defaultValue={warehouse?.code}
                  placeholder="MAIN"
                  className="font-mono uppercase"
                  disabled={isEdit}
                  required={!isEdit}
                />
              </Field>
              <Field label="Name" htmlFor="name" error={err("name")} required>
                <Input id="name" name="name" defaultValue={warehouse?.name} placeholder="Main Warehouse" required />
              </Field>
            </div>

            <Field label="Address" htmlFor="addressLine1">
              <Input id="addressLine1" name="addressLine1" defaultValue={warehouse?.addressLine1 ?? ""} placeholder="12 Industrial Estate" />
            </Field>

            <div className="grid grid-cols-3 gap-3">
              <Field label="City" htmlFor="city">
                <Input id="city" name="city" defaultValue={warehouse?.city ?? ""} />
              </Field>
              <Field label="State / region" htmlFor="region">
                <Input id="region" name="region" defaultValue={warehouse?.region ?? ""} />
              </Field>
              <Field label="Postal code" htmlFor="postalCode">
                <Input id="postalCode" name="postalCode" defaultValue={warehouse?.postalCode ?? ""} />
              </Field>
            </div>

            <Field label="Country" htmlFor="country">
              <Select id="country" name="country" defaultValue={warehouse?.country ?? defaultCountry}>
                {COUNTRY_LIST.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>

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
              {pending ? "Saving..." : isEdit ? "Save changes" : "Create warehouse"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  htmlFor,
  error,
  required,
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor} required={required}>
        {label}
      </Label>
      {children}
      {error ? <p className="text-2xs text-danger">{error}</p> : null}
    </div>
  );
}
