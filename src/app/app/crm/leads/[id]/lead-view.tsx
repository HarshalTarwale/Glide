"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowRightCircle } from "lucide-react";
import { PageHeader } from "@/components/erp/page-header";
import { RecordShell, RailSection, AuditTrail } from "@/components/erp/record-shell";
import { ActivityLog } from "@/components/erp/activity-log";
import { FieldGrid, Field } from "@/components/erp/field-grid";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { PermissionGate, useHasPermission } from "@/components/layout/session-context";
import type { LeadDTO } from "@/server/crm/leads";
import type { ActivityDTO } from "@/server/crm/activities";
import type { AuditEntryDTO } from "@/server/core/audit";
import { ConvertLeadDialog } from "./convert-dialog";
import { setLeadStatusAction } from "../../actions";

const STATUS_TONE: Record<string, "neutral" | "info" | "warning" | "accent" | "success" | "danger"> = {
  new: "neutral",
  contacted: "info",
  qualified: "accent",
  unqualified: "danger",
  converted: "success",
};

const STATUS_LABEL: Record<string, string> = {
  new: "New",
  contacted: "Contacted",
  qualified: "Qualified",
  unqualified: "Unqualified",
  converted: "Converted",
};

export function LeadView({ lead, activities, audit }: { lead: LeadDTO; activities: ActivityDTO[]; audit: AuditEntryDTO[] }) {
  const router = useRouter();
  const canWrite = useHasPermission("crm:lead:write");
  const canConvert = useHasPermission("crm:lead:convert");
  const [convertOpen, setConvertOpen] = React.useState(false);

  async function handleStatusChange(status: string) {
    const result = await setLeadStatusAction(lead.id, status);
    if (result.ok) {
      toast.success("Status updated");
      router.refresh();
    } else {
      toast.error(result.error ?? "Could not update status");
    }
  }

  const isConverted = lead.status === "converted";

  return (
    <RecordShell
      header={
        <PageHeader
          title={lead.name}
          crumbs={[{ label: "CRM" }, { label: "Leads", href: "/app/crm/leads" }, { label: lead.name }]}
          status={
            <Badge tone={STATUS_TONE[lead.status] ?? "neutral"} dot>
              {STATUS_LABEL[lead.status] ?? lead.status}
            </Badge>
          }
          meta={lead.companyName ?? undefined}
          actions={
            <>
              {!isConverted ? (
                <PermissionGate permission="crm:lead:write">
                  <Select
                    value={lead.status}
                    onChange={(e) => void handleStatusChange(e.target.value)}
                    disabled={!canWrite}
                    className="h-control w-40"
                  >
                    <option value="new">New</option>
                    <option value="contacted">Contacted</option>
                    <option value="qualified">Qualified</option>
                    <option value="unqualified">Unqualified</option>
                  </Select>
                </PermissionGate>
              ) : null}

              <PermissionGate permission="crm:lead:convert">
                {!isConverted ? (
                  <Button variant="primary" size="md" onClick={() => setConvertOpen(true)} disabled={!canConvert}>
                    <ArrowRightCircle />
                    Convert
                  </Button>
                ) : null}
              </PermissionGate>
            </>
          }
        />
      }
      rail={
        <>
          <RailSection title="Details">
            <FieldGrid className="sm:grid-cols-1 gap-y-3">
              <Field label="Email">{lead.email ?? "—"}</Field>
              <Field label="Phone">{lead.phone ?? "—"}</Field>
              <Field label="Source">{lead.source.replace("_", " ")}</Field>
              <Field label="Owner">{lead.ownerName ?? "—"}</Field>
              {isConverted ? (
                <Field label="Converted to">
                  <Link href={`/app/contacts/${lead.convertedPartnerId}`} className="text-accent hover:underline">
                    View contact
                  </Link>
                  {lead.convertedOpportunityId ? (
                    <>
                      {" · "}
                      <Link href={`/app/crm/pipeline/${lead.convertedOpportunityId}`} className="text-accent hover:underline">
                        View opportunity
                      </Link>
                    </>
                  ) : null}
                </Field>
              ) : null}
            </FieldGrid>
          </RailSection>
          <RailSection title="Activity history">
            {audit.length > 0 ? (
              <AuditTrail entries={audit.map((a) => ({ id: a.id, actor: a.actorName, action: a.action, at: new Date(a.at).toLocaleString() }))} />
            ) : (
              <p className="text-xs text-ink-subtle">No activity yet.</p>
            )}
          </RailSection>
        </>
      }
    >
      <div className="max-w-xl">
        {lead.notes ? (
          <div className="mb-6">
            <div className="mb-1.5 text-2xs font-semibold uppercase tracking-wide text-ink-subtle">Notes</div>
            <p className="text-sm text-ink-muted">{lead.notes}</p>
          </div>
        ) : null}

        <div className="mb-1.5 text-2xs font-semibold uppercase tracking-wide text-ink-subtle">Follow-ups</div>
        <ActivityLog activities={activities} leadId={lead.id} relatedPath={`/app/crm/leads/${lead.id}`} />
      </div>

      <ConvertLeadDialog open={convertOpen} onOpenChange={setConvertOpen} leadId={lead.id} leadName={lead.name} />
    </RecordShell>
  );
}
