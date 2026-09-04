"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/erp/page-header";
import { KpiTile } from "@/components/erp/kpi-tile";
import { EmptyState } from "@/components/erp/empty-state";
import { Money } from "@/components/erp/money";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { PermissionGate } from "@/components/layout/session-context";
import { groupByStage, STAGE_ORDER, type OpportunityStage } from "@/lib/crm/pipeline";
import type { OpportunityDTO } from "@/server/crm/opportunities";
import { changeStageAction } from "../actions";
import { LostReasonDialog } from "./lost-reason-dialog";

const STAGE_LABEL: Record<OpportunityStage, string> = {
  new: "New",
  qualified: "Qualified",
  proposal: "Proposal",
  negotiation: "Negotiation",
  won: "Won",
  lost: "Lost",
};

export function PipelineView({
  opportunities,
  summary,
}: {
  opportunities: OpportunityDTO[];
  summary: { openCount: number; openValue: number; weightedValue: number; wonCount: number; wonValue: number; winRate: number | null };
}) {
  const router = useRouter();
  const [pendingLost, setPendingLost] = React.useState<OpportunityDTO | null>(null);
  const columns = groupByStage(opportunities);
  const currency = opportunities[0]?.currency;

  async function moveStage(opportunity: OpportunityDTO, stage: OpportunityStage) {
    if (stage === "lost") {
      setPendingLost(opportunity);
      return;
    }
    const result = await changeStageAction(opportunity.id, stage);
    if (result.ok) {
      toast.success(`Moved to ${STAGE_LABEL[stage]}`);
      router.refresh();
    } else {
      toast.error(result.error ?? "Could not move the opportunity");
    }
  }

  return (
    <>
      <PageHeader
        title="Pipeline"
        crumbs={[{ label: "CRM" }, { label: "Pipeline" }]}
        actions={
          <PermissionGate permission="crm:opportunity:write">
            <Button variant="primary" size="md" asChild>
              <Link href="/app/crm/pipeline/new">
                <Plus />
                New opportunity
              </Link>
            </Button>
          </PermissionGate>
        }
      />

      <div className="grid grid-cols-2 gap-3 px-6 pt-4 sm:grid-cols-4">
        <KpiTile label="Open deals" value={summary.openCount} />
        <KpiTile label="Open value" value={<Money value={summary.openValue} currency={currency} />} />
        <KpiTile label="Weighted forecast" value={<Money value={summary.weightedValue} currency={currency} />} />
        <KpiTile label="Win rate" value={summary.winRate === null ? "—" : `${summary.winRate}%`} />
      </div>

      {opportunities.length === 0 ? (
        <EmptyState title="No opportunities yet" description="Create one, or convert a lead to start your pipeline." />
      ) : (
        <div className="flex-1 overflow-x-auto px-6 py-4">
          <div className="flex h-full min-w-max gap-3">
            {STAGE_ORDER.map((stage) => {
              const cards = columns.get(stage) ?? [];
              const columnValue = cards.reduce((s, o) => s + o.expectedValue, 0);
              return (
                <div key={stage} className="flex w-72 shrink-0 flex-col rounded-lg border border-hairline bg-surface-sunken">
                  <div className="flex items-center justify-between border-b border-hairline px-3 py-2.5">
                    <span className="text-xs font-semibold text-ink">{STAGE_LABEL[stage]}</span>
                    <span className="tnum text-2xs text-ink-subtle">{cards.length}</span>
                  </div>
                  <div className="px-3 py-1.5 text-2xs text-ink-subtle">
                    <Money value={columnValue} currency={currency} compact />
                  </div>
                  <div className="flex-1 space-y-2 overflow-y-auto px-2.5 pb-2.5">
                    {cards.map((o) => (
                      <div key={o.id} className="rounded-md border border-hairline bg-surface p-2.5">
                        <Link href={`/app/crm/pipeline/${o.id}`} className="block text-xs font-medium text-ink hover:text-accent">
                          {o.name}
                        </Link>
                        <div className="mt-0.5 text-2xs text-ink-muted">{o.partnerName}</div>
                        <div className="mt-1.5 flex items-center justify-between">
                          <Money value={o.expectedValue} currency={o.currency} className="text-xs font-medium" />
                          <span className="tnum text-2xs text-ink-subtle">{o.probability}%</span>
                        </div>
                        <PermissionGate permission="crm:opportunity:write">
                          {stage !== "won" && stage !== "lost" ? (
                            <Select
                              value={stage}
                              onChange={(e) => void moveStage(o, e.target.value as OpportunityStage)}
                              className="mt-2 h-7 w-full text-2xs"
                            >
                              {STAGE_ORDER.map((s) => (
                                <option key={s} value={s}>
                                  {STAGE_LABEL[s]}
                                </option>
                              ))}
                            </Select>
                          ) : null}
                        </PermissionGate>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <LostReasonDialog
        opportunity={pendingLost}
        open={pendingLost !== null}
        onOpenChange={(open) => !open && setPendingLost(null)}
        onSaved={() => {
          setPendingLost(null);
          router.refresh();
        }}
      />
    </>
  );
}
