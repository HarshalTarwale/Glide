"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CalendarPlus, Ban, CheckCircle2, X } from "lucide-react";
import { PageHeader } from "@/components/erp/page-header";
import { RecordShell, RailSection, AuditTrail } from "@/components/erp/record-shell";
import { FieldGrid, Field } from "@/components/erp/field-grid";
import { DateText } from "@/components/erp/money";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { PermissionGate, useHasPermission } from "@/components/layout/session-context";
import type { EmployeeDTO } from "@/server/hr/employees";
import type { LeaveRequestDTO } from "@/server/hr/leave-requests";
import type { LeaveBalance } from "@/lib/hr/leave";
import type { AuditEntryDTO } from "@/server/core/audit";
import { RequestLeaveDialog } from "./request-leave-dialog";
import { setEmployeeStatusAction, approveLeaveRequestAction, rejectLeaveRequestAction, cancelLeaveRequestAction } from "../../actions";

const STATUS_TONE: Record<string, "neutral" | "info" | "warning" | "accent" | "success" | "danger"> = {
  active: "success",
  on_leave: "warning",
  terminated: "danger",
};

const STATUS_LABEL: Record<string, string> = {
  active: "Active",
  on_leave: "On leave",
  terminated: "Terminated",
};

const LEAVE_STATUS_TONE: Record<string, "neutral" | "info" | "warning" | "accent" | "success" | "danger"> = {
  pending: "warning",
  approved: "success",
  rejected: "danger",
  cancelled: "neutral",
};

export function EmployeeView({
  employee,
  leaveRequests,
  balances,
  leaveTypes,
  audit,
}: {
  employee: EmployeeDTO;
  leaveRequests: LeaveRequestDTO[];
  balances: (LeaveBalance & { leaveTypeId: string; leaveTypeName: string })[];
  leaveTypes: { id: string; name: string }[];
  audit: AuditEntryDTO[];
}) {
  const router = useRouter();
  const canWrite = useHasPermission("hr:employee:write");
  const canApprove = useHasPermission("hr:leaverequest:approve");
  const [requestOpen, setRequestOpen] = React.useState(false);

  async function handleStatusChange(status: string) {
    const result = await setEmployeeStatusAction(employee.id, status);
    if (result.ok) {
      toast.success("Status updated");
      router.refresh();
    } else {
      toast.error(result.error ?? "Could not update status");
    }
  }

  async function handleApprove(id: string) {
    const result = await approveLeaveRequestAction(id, employee.id);
    if (result.ok) {
      toast.success("Leave approved");
      router.refresh();
    } else {
      toast.error(result.error ?? "Could not approve this request");
    }
  }

  async function handleReject(id: string) {
    const result = await rejectLeaveRequestAction(id, employee.id);
    if (result.ok) {
      toast.success("Leave rejected");
      router.refresh();
    } else {
      toast.error(result.error ?? "Could not reject this request");
    }
  }

  async function handleCancel(id: string) {
    const result = await cancelLeaveRequestAction(id, employee.id);
    if (result.ok) {
      toast.success("Request cancelled");
      router.refresh();
    } else {
      toast.error(result.error ?? "Could not cancel this request");
    }
  }

  return (
    <RecordShell
      header={
        <PageHeader
          title={employee.name}
          crumbs={[{ label: "HR" }, { label: "Employees", href: "/app/hr/employees" }, { label: employee.name }]}
          status={
            <Badge tone={STATUS_TONE[employee.status] ?? "neutral"} dot>
              {STATUS_LABEL[employee.status] ?? employee.status}
            </Badge>
          }
          meta={employee.jobTitle ?? undefined}
          actions={
            <>
              <PermissionGate permission="hr:employee:write">
                <Select value={employee.status} onChange={(e) => void handleStatusChange(e.target.value)} disabled={!canWrite} className="h-control w-36">
                  <option value="active">Active</option>
                  <option value="on_leave">On leave</option>
                  <option value="terminated">Terminated</option>
                </Select>
              </PermissionGate>

              <PermissionGate permission="hr:leaverequest:write">
                <Button variant="primary" size="md" onClick={() => setRequestOpen(true)}>
                  <CalendarPlus />
                  Request leave
                </Button>
              </PermissionGate>
            </>
          }
        />
      }
      rail={
        <>
          <RailSection title="Details">
            <FieldGrid className="sm:grid-cols-1 gap-y-3">
              <Field label="Code">{employee.code ?? "—"}</Field>
              <Field label="Email">{employee.email ?? "—"}</Field>
              <Field label="Phone">{employee.phone ?? "—"}</Field>
              <Field label="Department">{employee.departmentName ?? "—"}</Field>
              <Field label="Reports to">{employee.reportsToName ?? "—"}</Field>
              <Field label="Employment type">{employee.employmentType.replace("_", " ")}</Field>
              <Field label="Date of joining">
                <DateText value={employee.dateOfJoining} />
              </Field>
              {employee.dateOfLeaving ? (
                <Field label="Date of leaving">
                  <DateText value={employee.dateOfLeaving} />
                </Field>
              ) : null}
            </FieldGrid>
          </RailSection>
          <RailSection title="Leave balance">
            {balances.length === 0 ? (
              <p className="text-xs text-ink-subtle">No leave types configured yet.</p>
            ) : (
              <div className="space-y-2">
                {balances.map((b) => (
                  <div key={b.leaveTypeId} className="flex items-center justify-between text-sm">
                    <span className="text-ink-muted">{b.leaveTypeName}</span>
                    <span className={`tnum font-medium ${b.remaining < 0 ? "text-danger" : "text-ink"}`}>
                      {b.remaining} / {b.allocated}
                    </span>
                  </div>
                ))}
              </div>
            )}
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
      <div className="max-w-2xl">
        {employee.notes ? (
          <div className="mb-6">
            <div className="mb-1.5 text-2xs font-semibold uppercase tracking-wide text-ink-subtle">Notes</div>
            <p className="text-sm text-ink-muted">{employee.notes}</p>
          </div>
        ) : null}

        <div className="mb-1.5 text-2xs font-semibold uppercase tracking-wide text-ink-subtle">Leave requests</div>
        {leaveRequests.length === 0 ? (
          <p className="text-sm text-ink-subtle">No leave requested yet.</p>
        ) : (
          <div className="overflow-hidden rounded-lg border border-hairline">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-hairline bg-surface-sunken text-2xs uppercase tracking-wide text-ink-subtle">
                  <th className="px-3 py-2 text-left font-semibold">Type</th>
                  <th className="px-3 py-2 text-left font-semibold">Dates</th>
                  <th className="px-3 py-2 text-right font-semibold">Days</th>
                  <th className="px-3 py-2 text-left font-semibold">Status</th>
                  <th className="w-24" />
                </tr>
              </thead>
              <tbody>
                {leaveRequests.map((r) => (
                  <tr key={r.id} className="h-row border-b border-hairline last:border-0">
                    <td className="px-3 font-medium text-ink">{r.leaveTypeName}</td>
                    <td className="px-3 text-ink-muted">
                      <DateText value={r.startDate} /> – <DateText value={r.endDate} />
                    </td>
                    <td className="tnum px-3 text-right">{r.days}</td>
                    <td className="px-3">
                      <Badge tone={LEAVE_STATUS_TONE[r.status] ?? "neutral"} dot>
                        {r.status}
                      </Badge>
                    </td>
                    <td className="px-2">
                      {r.status === "pending" ? (
                        <div className="flex justify-end gap-1">
                          {canApprove ? (
                            <>
                              <Button variant="ghost" size="iconSm" aria-label="Approve" onClick={() => void handleApprove(r.id)}>
                                <CheckCircle2 className="text-success" />
                              </Button>
                              <Button variant="ghost" size="iconSm" aria-label="Reject" onClick={() => void handleReject(r.id)}>
                                <Ban className="text-danger" />
                              </Button>
                            </>
                          ) : (
                            <Button variant="ghost" size="iconSm" aria-label="Cancel" onClick={() => void handleCancel(r.id)}>
                              <X className="text-ink-subtle" />
                            </Button>
                          )}
                        </div>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <RequestLeaveDialog
        open={requestOpen}
        onOpenChange={setRequestOpen}
        employeeId={employee.id}
        leaveTypes={leaveTypes}
        onSaved={() => {
          toast.success("Leave request submitted");
          router.refresh();
        }}
      />
    </RecordShell>
  );
}
