"use client";

import { useActionState } from "react";
import { AlertCircle } from "lucide-react";
import { PageHeader } from "@/components/erp/page-header";
import { FormSection } from "@/components/erp/field-grid";
import { Input, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { createLeadAction, type ActionResult } from "../../actions";

export function NewLeadForm() {
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(createLeadAction, { ok: false });
  const err = (field: string) => state.fieldErrors?.[field];

  return (
    <>
      <PageHeader title="New lead" crumbs={[{ label: "CRM" }, { label: "Leads", href: "/app/crm/leads" }, { label: "New lead" }]} />

      <form action={formAction} className="flex-1 overflow-auto px-6 py-5">
        <FormSection title="Lead details" className="pt-0">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="name" required>
                Name
              </Label>
              <Input id="name" name="name" placeholder="Priya Shah" required />
              {err("name") ? <p className="text-2xs text-danger">{err("name")}</p> : null}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="companyName">Company</Label>
              <Input id="companyName" name="companyName" placeholder="Shah Textiles" />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" />
              {err("email") ? <p className="text-2xs text-danger">{err("email")}</p> : null}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="phone">Phone</Label>
              <Input id="phone" name="phone" type="tel" />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="source">Source</Label>
              <Select id="source" name="source" defaultValue="other">
                <option value="website">Website</option>
                <option value="referral">Referral</option>
                <option value="cold_outreach">Cold outreach</option>
                <option value="event">Event</option>
                <option value="advertising">Advertising</option>
                <option value="other">Other</option>
              </Select>
            </div>
          </div>
        </FormSection>

        <FormSection title="Notes" className="pb-0">
          <Textarea name="notes" placeholder="Anything worth remembering about this lead..." />
        </FormSection>

        {state.error ? (
          <div role="alert" className="mt-4 flex items-start gap-2 rounded-md border border-danger/20 bg-danger-soft px-3 py-2 text-xs text-danger">
            <AlertCircle className="mt-px size-3.5 shrink-0" />
            <span>{state.error}</span>
          </div>
        ) : null}

        <div className="mt-6 flex justify-end gap-2 border-t border-hairline pt-4">
          <Button type="submit" variant="primary" size="md" disabled={pending}>
            {pending ? "Creating..." : "Create lead"}
          </Button>
        </div>
      </form>
    </>
  );
}
