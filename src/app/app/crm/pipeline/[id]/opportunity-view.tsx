"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Ban, Trophy } from "lucide-react";
import { PageHeader } from "@/components/erp/page-header";
import { RecordShell, RailSection, AuditTrail } from "@/components/erp/record-shell";
import { StatusStepper } from "@/components/erp/status-stepper";
import { ActivityLog } from "@/components/erp/activity-log";
import { FieldGrid, Field } from "@/components/erp/field-grid";
import { Money, DateText } from "@/components/erp/money";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PermissionGate, useHasPermission } from "@/components/layout/session-context";
import type { OpportunityDTO } from "@/server/crm/opportunities";
import type { ActivityDTO } from "@/server/crm/activities";
import type { AuditEntryDTO } from "@/server/core/audit";
import { LostReasonDialog } from "../lost-reason-dialog";
import { changeStageAction } from "../../actions";

const STAGE_TONE: Record<string, "neutral" | "info" | "warning" | "accent" | "success" | "danger"> = {
  new: "neutral",
  qualified: "info",
  proposal: "accent",
  negotiation: "warning",
  won: "success",
  lost: "danger",
};

const STAGE_LABEL: Record<string, string> = {
  new: "New",
  qualified: "Qualified",
  proposal: "Proposal",
  negotiation: "Negotiation",
  won: "Won",
  lost: "Lost",
};

const STEPS = [
  { id: "new", label: "New" },
  { id: "qualified", label: "Qualified" },
  { id: "proposal", label: "Proposal" },
  { id: "negotiation", label: "Negotiation" },
  { id: "won", label: "Won" },
];

export function OpportunityView({
  opportunity,
  activities,
  audit,
}: {
  opportunity: OpportunityDTO;
  activities: ActivityDTO[];
  audit: AuditEntryDTO[];
}) {
  const router = useRouter();
  const canWrite = useHasPermission("crm:opportunity:write");
  const [lostOpen, setLostOpen] = React.useState(false);

  async function handleWin() {
    const result = await changeStageAction(opportunity.id, "won");
    if (result.ok) {
      toast.success("Marked won 🎉");
      router.refresh();
    } else {
      toast.error(result.error ?? "Could not mark this opportunity won");
    }
  }

  const isOpen = opportunity.stage !== "won" && opportunity.stage !== "lost";
  const stepId = opportunity.stage === "lost" ? "new" : opportunity.stage;

  return (
    <RecordShell
      header={
        <PageHeader
          title={opportunity.name}
          crumbs={[{ label: "CRM" }, { label: "Pipeline", href: "/app/crm/pipeline" }, { label: opportunity.name }]}
          status={
            <Badge tone={STAGE_TONE[opportunity.stage] ?? "neutral"} dot>
              {STAGE_LABEL[opportunity.stage] ?? opportunity.stage}
            </Badge>
          }
          meta={
            <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <Link href={`/app/contacts/${opportunity.partnerId}`} className="text-accent hover:underline">
                {opportunity.partnerName}
              </Link>
              {opportunity.expectedCloseDate ? (
                <>
                  <span className="text-ink-subtle">·</span>
                  <span>
                    Expected close <DateText value={opportunity.expectedCloseDate} />
                  </span>
                </>
              ) : null}
            </span>
          }
          actions={
            <>
              <StatusStepper steps={STEPS} current={stepId} cancelled={opportunity.stage === "lost"} className="mr-2 hidden xl:flex" />
              <PermissionGate permission="crm:opportunity:write">
                {isOpen ? (
                  <>
                    <Button variant="ghost" size="md" className="text-danger hover:bg-danger-soft" onClick={() => setLostOpen(true)} disabled={!canWrite}>
                      <Ban />
                      Mark lost
                    </Button>
                    <Button variant="primary" size="md" onClick={handleWin} disabled={!canWrite}>
                      <Trophy />
                      Mark won
                    </Button>
                  </>
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
              <Field label="Expected value">
                <Money value={opportunity.expectedValue} currency={opportunity.currency} />
              </Field>
              <Field label="Probability">{opportunity.probability}%</Field>
              <Field label="Owner">{opportunity.ownerName ?? "—"}</Field>
              {opportunity.stage === "lost" && opportunity.lostReason ? <Field label="Lost reason">{opportunity.lostReason}</Field> : null}
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
        {opportunity.notes ? (
          <div className="mb-6">
            <div className="mb-1.5 text-2xs font-semibold uppercase tracking-wide text-ink-subtle">Notes</div>
            <p className="text-sm text-ink-muted">{opportunity.notes}</p>
          </div>
        ) : null}

        <div className="mb-1.5 text-2xs font-semibold uppercase tracking-wide text-ink-subtle">Follow-ups</div>
        <ActivityLog activities={activities} opportunityId={opportunity.id} relatedPath={`/app/crm/pipeline/${opportunity.id}`} />
      </div>

      <LostReasonDialog
        opportunity={lostOpen ? opportunity : null}
        open={lostOpen}
        onOpenChange={setLostOpen}
        onSaved={() => {
          setLostOpen(false);
          router.refresh();
        }}
      />
    </RecordShell>
  );
}
