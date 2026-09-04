"use client";

import { useActionState } from "react";
import { AlertCircle } from "lucide-react";
import { PageHeader } from "@/components/erp/page-header";
import { FormSection } from "@/components/erp/field-grid";
import { Input, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import type { CrmFormOptions } from "@/server/crm/options";
import { createOpportunityAction, type ActionResult } from "../../actions";

export function NewOpportunityForm({ options }: { options: CrmFormOptions }) {
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(createOpportunityAction, { ok: false });
  const err = (field: string) => state.fieldErrors?.[field];

  return (
    <>
      <PageHeader title="New opportunity" crumbs={[{ label: "CRM" }, { label: "Pipeline", href: "/app/crm/pipeline" }, { label: "New opportunity" }]} />

      <form action={formAction} className="flex-1 overflow-auto px-6 py-5">
        <FormSection title="Opportunity details" className="pt-0">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="name" required>
                Name
              </Label>
              <Input id="name" name="name" placeholder="Acme Corp — annual contract" required />
              {err("name") ? <p className="text-2xs text-danger">{err("name")}</p> : null}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="partnerId" required>
                Contact
              </Label>
              <Select id="partnerId" name="partnerId" required defaultValue="">
                <option value="">Select a contact...</option>
                {options.partners.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
              {err("partnerId") ? <p className="text-2xs text-danger">{err("partnerId")}</p> : null}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="expectedValue">Expected value</Label>
              <Input id="expectedValue" name="expectedValue" type="number" min="0" step="0.01" defaultValue="0" className="tnum" />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="expectedCloseDate">Expected close</Label>
              <Input id="expectedCloseDate" name="expectedCloseDate" type="date" />
            </div>
          </div>
        </FormSection>

        <FormSection title="Notes" className="pb-0">
          <Textarea name="notes" placeholder="Anything worth remembering about this deal..." />
        </FormSection>

        {state.error ? (
          <div role="alert" className="mt-4 flex items-start gap-2 rounded-md border border-danger/20 bg-danger-soft px-3 py-2 text-xs text-danger">
            <AlertCircle className="mt-px size-3.5 shrink-0" />
            <span>{state.error}</span>
          </div>
        ) : null}

        <div className="mt-6 flex justify-end gap-2 border-t border-hairline pt-4">
          <Button type="submit" variant="primary" size="md" disabled={pending}>
            {pending ? "Creating..." : "Create opportunity"}
          </Button>
        </div>
      </form>
    </>
  );
}
