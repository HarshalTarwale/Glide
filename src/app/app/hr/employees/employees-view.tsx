"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/erp/page-header";
import { FilterBar, type QuickFilter } from "@/components/erp/filter-bar";
import { DataTable, type Column } from "@/components/erp/data-table";
import { DateText } from "@/components/erp/money";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PermissionGate } from "@/components/layout/session-context";
import { queryToSearchParams, type RecordPage, type RecordQuery } from "@/lib/query/record-query";
import type { EmployeeDTO } from "@/server/hr/employees";

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

const QUICK_FILTERS: QuickFilter[] = [
  { id: "active", label: "Active", filters: [{ field: "status", op: "eq", value: "active", label: "Active" }] },
  { id: "terminated", label: "Terminated", filters: [{ field: "status", op: "eq", value: "terminated", label: "Terminated" }] },
];

export function EmployeesView({ page, query }: { page: RecordPage<EmployeeDTO>; query: RecordQuery }) {
  const router = useRouter();

  const setQuery = React.useCallback(
    (next: RecordQuery) => {
      const sp = queryToSearchParams(next);
      router.push(sp.size ? `/app/hr/employees?${sp}` : "/app/hr/employees", { scroll: false });
    },
    [router]
  );

  const columns: Column<EmployeeDTO>[] = [
    { id: "name", header: "Name", sortField: "name", cell: (r) => <span className="font-medium text-ink">{r.name}</span> },
    { id: "jobTitle", header: "Job title", cell: (r) => <span className="text-ink-muted">{r.jobTitle ?? "—"}</span> },
    { id: "department", header: "Department", optional: true, cell: (r) => <span className="text-ink-muted">{r.departmentName ?? "—"}</span> },
    { id: "employmentType", header: "Type", optional: true, cell: (r) => <span className="text-ink-muted capitalize">{r.employmentType.replace("_", " ")}</span> },
    { id: "dateOfJoining", header: "Joined", sortField: "dateOfJoining", cell: (r) => <DateText value={r.dateOfJoining} className="text-ink-muted" /> },
    {
      id: "status",
      header: "Status",
      sortField: "status",
      width: "120px",
      cell: (r) => (
        <Badge tone={STATUS_TONE[r.status] ?? "neutral"} dot>
          {STATUS_LABEL[r.status] ?? r.status}
        </Badge>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Employees"
        crumbs={[{ label: "HR" }, { label: "Employees" }]}
        actions={
          <PermissionGate permission="hr:employee:write">
            <Button variant="primary" size="md" asChild>
              <Link href="/app/hr/employees/new">
                <Plus />
                New employee
              </Link>
            </Button>
          </PermissionGate>
        }
      />

      <FilterBar query={query} onQueryChange={setQuery} quickFilters={QUICK_FILTERS} searchPlaceholder="Search employees, titles..." />

      <DataTable
        data={page}
        columns={columns}
        query={query}
        onQueryChange={setQuery}
        rowKey={(r) => r.id}
        onRowClick={(r) => router.push(`/app/hr/employees/${r.id}`)}
        emptyTitle="No employees match this filter"
        emptyDescription="Try clearing a filter, or add the first employee."
      />
    </>
  );
}
