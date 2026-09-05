"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/erp/page-header";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/erp/empty-state";
import { PermissionGate, useHasPermission } from "@/components/layout/session-context";
import type { LeaveTypeDTO } from "@/server/hr/leave-types";
import { LeaveTypeForm } from "./leave-type-form";

export function LeaveTypesView({ leaveTypes }: { leaveTypes: LeaveTypeDTO[] }) {
  const router = useRouter();
  const canWrite = useHasPermission("hr:leavetype:write");
  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<LeaveTypeDTO | null>(null);

  function openCreate() {
    setEditing(null);
    setFormOpen(true);
  }

  function openEdit(leaveType: LeaveTypeDTO) {
    if (!canWrite) return;
    setEditing(leaveType);
    setFormOpen(true);
  }

  function handleSaved() {
    toast.success(editing ? "Leave type updated" : "Leave type created");
    router.refresh();
  }

  return (
    <>
      <PageHeader
        title="Leave Types"
        crumbs={[{ label: "HR" }, { label: "Leave Types" }]}
        meta="The types of leave employees can request, and how many days each gets a year."
        actions={
          <PermissionGate permission="hr:leavetype:write">
            <Button variant="primary" size="md" onClick={openCreate}>
              <Plus />
              New leave type
            </Button>
          </PermissionGate>
        }
      />

      <div className="flex-1 overflow-auto px-6 py-6">
        {leaveTypes.length === 0 ? (
          <EmptyState title="No leave types yet" description="Add one, like Annual or Sick Leave, to start tracking requests against it." />
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>Leave types</CardTitle>
            </CardHeader>
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-hairline bg-surface-sunken text-2xs uppercase tracking-wide text-ink-subtle">
                  <th className="px-4 py-2 text-left font-semibold">Code</th>
                  <th className="px-4 py-2 text-left font-semibold">Name</th>
                  <th className="px-4 py-2 text-right font-semibold">Annual days</th>
                  <th className="px-4 py-2 text-left font-semibold">Paid</th>
                </tr>
              </thead>
              <tbody>
                {leaveTypes.map((t) => (
                  <tr key={t.id} className="h-row cursor-pointer border-b border-hairline last:border-0 hover:bg-surface-sunken" onClick={() => openEdit(t)}>
                    <td className="px-4 font-mono text-xs text-ink-muted">{t.code}</td>
                    <td className="px-4 font-medium text-ink">{t.name}</td>
                    <td className="tnum px-4 text-right">{t.defaultAnnualDays}</td>
                    <td className="px-4">
                      {t.isPaid ? (
                        <Badge tone="success" dot>
                          Paid
                        </Badge>
                      ) : (
                        <Badge tone="neutral" dot>
                          Unpaid
                        </Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </div>

      <LeaveTypeForm open={formOpen} onOpenChange={setFormOpen} leaveType={editing} onSaved={handleSaved} />
    </>
  );
}
