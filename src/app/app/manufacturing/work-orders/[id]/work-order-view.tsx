"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Ban, CheckCircle2, PlayCircle } from "lucide-react";
import { PageHeader } from "@/components/erp/page-header";
import { RecordShell, RailSection, AuditTrail } from "@/components/erp/record-shell";
import { StatusStepper } from "@/components/erp/status-stepper";
import { FieldGrid, Field } from "@/components/erp/field-grid";
import { DateText, Money } from "@/components/erp/money";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PermissionGate, useHasPermission } from "@/components/layout/session-context";
import type { WorkOrderDTO } from "@/server/manufacturing/work-orders";
import type { AuditEntryDTO } from "@/server/core/audit";
import { confirmWorkOrderAction, completeWorkOrderAction, cancelWorkOrderAction } from "../../actions";

const STATUS_TONE: Record<string, "neutral" | "info" | "warning" | "accent" | "success" | "danger"> = {
  draft: "neutral",
  confirmed: "info",
  done: "success",
  cancelled: "danger",
};

const STEPS = [
  { id: "draft", label: "Draft" },
  { id: "confirmed", label: "Confirmed" },
  { id: "done", label: "Done" },
];

export function WorkOrderView({ workOrder, audit }: { workOrder: WorkOrderDTO; audit: AuditEntryDTO[] }) {
  const router = useRouter();
  const canConfirm = useHasPermission("manufacturing:workorder:confirm");
  const canComplete = useHasPermission("manufacturing:workorder:complete");
  const canCancel = useHasPermission("manufacturing:workorder:cancel");
  const [busy, setBusy] = React.useState(false);

  async function handleConfirm() {
    setBusy(true);
    const result = await confirmWorkOrderAction(workOrder.id);
    setBusy(false);
    if (result.ok) {
      toast.success("Work order confirmed");
      router.refresh();
    } else {
      toast.error(result.error ?? "Could not confirm this work order");
    }
  }

  async function handleComplete() {
    setBusy(true);
    const result = await completeWorkOrderAction(workOrder.id);
    setBusy(false);
    if (result.ok) {
      toast.success("Work order completed -- stock updated");
      router.refresh();
    } else {
      toast.error(result.error ?? "Could not complete this work order");
    }
  }

  async function handleCancel() {
    setBusy(true);
    const result = await cancelWorkOrderAction(workOrder.id);
    setBusy(false);
    if (result.ok) {
      toast.success("Work order cancelled");
      router.refresh();
    } else {
      toast.error(result.error ?? "Could not cancel this work order");
    }
  }

  const isDraft = workOrder.status === "draft";
  const isConfirmed = workOrder.status === "confirmed";
  const isOpen = isDraft || isConfirmed;

  return (
    <RecordShell
      header={
        <PageHeader
          title={workOrder.number}
          crumbs={[{ label: "Manufacturing", href: "/app/manufacturing/work-orders" }, { label: "Work Orders", href: "/app/manufacturing/work-orders" }, { label: workOrder.number }]}
          status={
            <Badge tone={STATUS_TONE[workOrder.status] ?? "neutral"} dot>
              {workOrder.status}
            </Badge>
          }
          meta={
            <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <span>{workOrder.productName}</span>
              <span className="text-ink-subtle">·</span>
              <span>{workOrder.warehouseName}</span>
            </span>
          }
          actions={
            <>
              <StatusStepper steps={STEPS} current={workOrder.status} cancelled={workOrder.status === "cancelled"} className="mr-2 hidden xl:flex" />

              {isDraft ? (
                <PermissionGate permission="manufacturing:workorder:confirm">
                  <Button variant="primary" size="md" onClick={handleConfirm} disabled={busy || !canConfirm}>
                    <PlayCircle />
                    Confirm
                  </Button>
                </PermissionGate>
              ) : null}

              {isConfirmed ? (
                <PermissionGate permission="manufacturing:workorder:complete">
                  <Button variant="primary" size="md" onClick={handleComplete} disabled={busy || !canComplete}>
                    <CheckCircle2 />
                    Complete
                  </Button>
                </PermissionGate>
              ) : null}
            </>
          }
        />
      }
      rail={
        <>
          <RailSection title="Details">
            <FieldGrid className="sm:grid-cols-1 gap-y-3">
              <Field label="Quantity to produce">{workOrder.quantity}</Field>
              <Field label="Scheduled date">{workOrder.scheduledDate ? <DateText value={workOrder.scheduledDate} /> : "—"}</Field>
              <Field label="Completed">{workOrder.completedAt ? <DateText value={workOrder.completedAt} /> : "Not yet completed"}</Field>
              {workOrder.unitCost !== null ? (
                <Field label="Produced unit cost">
                  <Money value={workOrder.unitCost} />
                </Field>
              ) : null}
            </FieldGrid>
          </RailSection>
          <RailSection title="Activity">
            {audit.length > 0 ? (
              <AuditTrail entries={audit.map((a) => ({ id: a.id, actor: a.actorName, action: a.action, at: new Date(a.at).toLocaleString() }))} />
            ) : (
              <p className="text-xs text-ink-subtle">No activity yet.</p>
            )}
          </RailSection>
        </>
      }
    >
      <div className="mb-1.5 text-2xs font-semibold uppercase tracking-wide text-ink-subtle">Components</div>
      <div className="overflow-hidden rounded-lg border border-hairline">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-hairline bg-surface-sunken text-2xs uppercase tracking-wide text-ink-subtle">
              <th className="px-3 py-2 text-left font-semibold">Component</th>
              <th className="px-3 py-2 text-right font-semibold">Planned qty</th>
            </tr>
          </thead>
          <tbody>
            {workOrder.lines.map((l) => (
              <tr key={l.id} className="h-row border-b border-hairline last:border-0">
                <td className="px-3">
                  <span className="font-medium text-ink">{l.componentName}</span>{" "}
                  <span className="font-mono text-2xs text-ink-subtle">({l.componentSku})</span>
                </td>
                <td className="tnum px-3 text-right">{l.plannedQty}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {workOrder.status === "done" ? (
        <p className="mt-3 text-2xs text-ink-subtle">
          Completed -- {workOrder.quantity} {workOrder.productName} produced at {workOrder.unitCost} per unit, the actual cost of the components consumed.
        </p>
      ) : null}

      {workOrder.notes ? <p className="mt-4 text-sm text-ink-muted">{workOrder.notes}</p> : null}

      {isOpen ? (
        <PermissionGate permission="manufacturing:workorder:cancel">
          <div className="mt-8 flex justify-end border-t border-hairline pt-4">
            <Button variant="ghost" size="sm" className="text-danger hover:bg-danger-soft" onClick={handleCancel} disabled={busy || !canCancel}>
              <Ban />
              Cancel work order
            </Button>
          </div>
        </PermissionGate>
      ) : null}
    </RecordShell>
  );
}
