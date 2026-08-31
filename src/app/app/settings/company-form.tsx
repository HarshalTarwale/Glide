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
import { Button } from "@/components/ui/button";
import { FormSection } from "@/components/erp/field-grid";
import type { CompanyDTO } from "@/server/core/company";
import { updateCompanyAction, type ActionResult } from "./actions";

export function CompanyForm({
  open,
  onOpenChange,
  company,
  regionLabel,
  taxIdLabel,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  company: CompanyDTO;
  regionLabel: string;
  taxIdLabel: string;
  onSaved: () => void;
}) {
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(updateCompanyAction, { ok: false });

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
          <DialogTitle>Edit organisation</DialogTitle>
          <DialogDescription>
            Some tax regimes (India GST, US sales tax) need {regionLabel.toLowerCase()} to calculate tax correctly — set it now if you sell there.
          </DialogDescription>
        </DialogHeader>

        <form action={formAction}>
          <DialogBody className="max-h-[65vh] space-y-1 overflow-y-auto">
            <FormSection title="Identity" className="pt-0">
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="name" required>
                    Name
                  </Label>
                  <Input id="name" name="name" defaultValue={company.name} required />
                  {err("name") ? <p className="text-2xs text-danger">{err("name")}</p> : null}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="legalName">Legal name</Label>
                    <Input id="legalName" name="legalName" defaultValue={company.legalName ?? ""} placeholder="If different from above" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="taxId">{taxIdLabel}</Label>
                    <Input id="taxId" name="taxId" defaultValue={company.taxId ?? ""} className="font-mono" />
                  </div>
                </div>
              </div>
            </FormSection>

            <FormSection title="Registered address" className="pb-0">
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="addressLine1">Address line</Label>
                  <Input id="addressLine1" name="addressLine1" defaultValue={company.addressLine1 ?? ""} />
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="city">City</Label>
                    <Input id="city" name="city" defaultValue={company.city ?? ""} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="region">{regionLabel}</Label>
                    <Input id="region" name="region" defaultValue={company.region ?? ""} />
                    {err("region") ? <p className="text-2xs text-danger">{err("region")}</p> : null}
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="postalCode">Postal code</Label>
                    <Input id="postalCode" name="postalCode" defaultValue={company.postalCode ?? ""} />
                  </div>
                </div>
              </div>
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
              {pending ? "Saving..." : "Save changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
