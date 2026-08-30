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
import { Input, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { FormSection } from "@/components/erp/field-grid";
import { COUNTRY_LIST } from "@/lib/i18n/countries";
import type { PartnerDTO } from "@/server/core/partners";
import { createPartnerAction, updatePartnerAction, type ActionResult } from "./actions";

export function PartnerForm({
  open,
  onOpenChange,
  partner,
  defaultCountry,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Present = editing; absent = creating. */
  partner?: PartnerDTO | null;
  defaultCountry: string;
  onSaved: () => void;
}) {
  const isEdit = Boolean(partner);
  const action = isEdit ? updatePartnerAction.bind(null, partner!.id) : createPartnerAction;

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
  const country = COUNTRY_LIST.find((c) => c.code === (partner?.billingCountry ?? defaultCountry));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit contact" : "New contact"}</DialogTitle>
          <DialogDescription>
            {isEdit ? `Editing ${partner!.name}` : "Customer, supplier, or both — set them below."}
          </DialogDescription>
        </DialogHeader>

        <form action={formAction}>
          <DialogBody className="max-h-[65vh] space-y-1 overflow-y-auto">
            <FormSection title="Details" className="pt-0">
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Name" htmlFor="name" error={err("name")} required>
                    <Input id="name" name="name" defaultValue={partner?.name} placeholder="Acme Industrial Supplies" required />
                  </Field>
                  <Field label="Code" htmlFor="code" error={err("code")}>
                    <Input id="code" name="code" defaultValue={partner?.code ?? ""} placeholder="ACME" className="font-mono" />
                  </Field>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <Field label="Type" htmlFor="kind">
                    <Select id="kind" name="kind" defaultValue={partner?.kind ?? "company"}>
                      <option value="company">Company</option>
                      <option value="person">Person</option>
                    </Select>
                  </Field>
                  <Field label="Payment terms (days)" htmlFor="paymentTermDays" error={err("paymentTermDays")}>
                    <Input
                      id="paymentTermDays"
                      name="paymentTermDays"
                      type="number"
                      min="0"
                      step="1"
                      defaultValue={partner?.paymentTermDays ?? 30}
                    />
                  </Field>
                </div>

                <div className="flex gap-6">
                  <label className="flex items-center gap-2 text-sm text-ink">
                    <Checkbox name="isCustomer" defaultChecked={partner?.isCustomer ?? true} />
                    Customer
                  </label>
                  <label className="flex items-center gap-2 text-sm text-ink">
                    <Checkbox name="isSupplier" defaultChecked={partner?.isSupplier ?? false} />
                    Supplier
                  </label>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <Field label="Email" htmlFor="email" error={err("email")}>
                    <Input id="email" name="email" type="email" defaultValue={partner?.email ?? ""} placeholder="accounts@example.com" />
                  </Field>
                  <Field label="Phone" htmlFor="phone" error={err("phone")}>
                    <Input id="phone" name="phone" defaultValue={partner?.phone ?? ""} placeholder="+91 98765 43210" />
                  </Field>
                </div>
              </div>
            </FormSection>

            <FormSection title="Billing address">
              <div className="space-y-4">
                <Field label="Address line" htmlFor="billingLine1" error={err("billingLine1")}>
                  <Input id="billingLine1" name="billingLine1" defaultValue={partner?.billingLine1 ?? ""} placeholder="12 Industrial Estate" />
                </Field>
                <div className="grid grid-cols-3 gap-3">
                  <Field label="City" htmlFor="billingCity">
                    <Input id="billingCity" name="billingCity" defaultValue={partner?.billingCity ?? ""} />
                  </Field>
                  <Field label="State / region" htmlFor="billingRegion">
                    <Input id="billingRegion" name="billingRegion" defaultValue={partner?.billingRegion ?? ""} />
                  </Field>
                  <Field label="Postal code" htmlFor="billingPostalCode">
                    <Input id="billingPostalCode" name="billingPostalCode" />
                  </Field>
                </div>
                <Field label="Country" htmlFor="billingCountry">
                  <Select id="billingCountry" name="billingCountry" defaultValue={country?.code ?? defaultCountry}>
                    {COUNTRY_LIST.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.name}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
            </FormSection>

            <FormSection title="Tax registration">
              <div className="grid grid-cols-2 gap-3">
                <Field label={country?.taxIdLabel ?? "Tax ID"} htmlFor="taxId" error={err("taxId")}>
                  <Input id="taxId" name="taxId" defaultValue={partner?.taxId ?? ""} className="font-mono" placeholder="27AABCU9603R1ZX" />
                </Field>
                <Field label="Registered in" htmlFor="taxIdCountry">
                  <Select id="taxIdCountry" name="taxIdCountry" defaultValue={partner?.taxIdCountry ?? defaultCountry}>
                    {COUNTRY_LIST.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.name}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
            </FormSection>

            <FormSection title="Notes" className="pb-0">
              <Textarea name="notes" defaultValue={partner?.notes ?? ""} placeholder="Internal notes about this contact..." />
            </FormSection>

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
              {pending ? "Saving..." : isEdit ? "Save changes" : "Create contact"}
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
