"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/erp/page-header";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/erp/empty-state";
import { PermissionGate, useHasPermission } from "@/components/layout/session-context";
import type { DepartmentDTO } from "@/server/hr/departments";
import { DepartmentForm } from "./department-form";
import { deleteDepartmentAction } from "../actions";

export function DepartmentsView({ departments }: { departments: DepartmentDTO[] }) {
  const router = useRouter();
  const canWrite = useHasPermission("hr:employee:write");
  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<DepartmentDTO | null>(null);

  function openCreate() {
    setEditing(null);
    setFormOpen(true);
  }

  function openEdit(department: DepartmentDTO) {
    if (!canWrite) return;
    setEditing(department);
    setFormOpen(true);
  }

  function handleSaved() {
    toast.success(editing ? "Department renamed" : "Department created");
    router.refresh();
  }

  async function handleDelete(id: string, name: string) {
    const result = await deleteDepartmentAction(id);
    if (result.ok) {
      toast.success(`${name} deleted`);
      router.refresh();
    } else {
      toast.error(result.error ?? "Could not delete that department");
    }
  }

  return (
    <>
      <PageHeader
        title="Departments"
        crumbs={[{ label: "HR" }, { label: "Departments" }]}
        meta="Groups employees for reporting -- they don't affect permissions."
        actions={
          <PermissionGate permission="hr:employee:write">
            <Button variant="primary" size="md" onClick={openCreate}>
              <Plus />
              New department
            </Button>
          </PermissionGate>
        }
      />

      <div className="flex-1 overflow-auto px-6 py-6">
        {departments.length === 0 ? (
          <EmptyState title="No departments yet" description="Add one to start grouping employees." />
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>Departments</CardTitle>
            </CardHeader>
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-hairline bg-surface-sunken text-2xs uppercase tracking-wide text-ink-subtle">
                  <th className="px-4 py-2 text-left font-semibold">Name</th>
                  <th className="px-4 py-2 text-right font-semibold">Employees</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody>
                {departments.map((d) => (
                  <tr key={d.id} className="h-row cursor-pointer border-b border-hairline last:border-0 hover:bg-surface-sunken" onClick={() => openEdit(d)}>
                    <td className="px-4 font-medium text-ink">{d.name}</td>
                    <td className="tnum px-4 text-right text-ink-muted">{d.employeeCount}</td>
                    <td className="px-2" onClick={(e) => e.stopPropagation()}>
                      {canWrite && d.employeeCount === 0 ? (
                        <Button variant="ghost" size="iconSm" aria-label={`Delete ${d.name}`} onClick={() => void handleDelete(d.id, d.name)}>
                          <Trash2 className="text-ink-subtle" />
                        </Button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </div>

      <DepartmentForm open={formOpen} onOpenChange={setFormOpen} department={editing} onSaved={handleSaved} />
    </>
  );
}
