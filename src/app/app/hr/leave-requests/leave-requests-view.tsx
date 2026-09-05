"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2, Ban } from "lucide-react";
import { PageHeader } from "@/components/erp/page-header";
import { FilterBar, type QuickFilter } from "@/components/erp/filter-bar";
import { DataTable, type Column } from "@/components/erp/data-table";
import { DateText } from "@/components/erp/money";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useHasPermission } from "@/components/layout/session-context";
import { queryToSearchParams, type RecordPage, type RecordQuery } from "@/lib/query/record-query";
import type { LeaveRequestDTO } from "@/server/hr/leave-requests";
import { approveLeaveRequestAction, rejectLeaveRequestAction } from "../actions";

const STATUS_TONE: Record<string, "neutral" | "info" | "warning" | "accent" | "success" | "danger"> = {
  pending: "warning",
  approved: "success",
  rejected: "danger",
  cancelled: "neutral",
};

const QUICK_FILTERS: QuickFilter[] = [
  { id: "pending", label: "Pending", filters: [{ field: "status", op: "eq", value: "pending", label: "Pending" }] },
  { id: "approved", label: "Approved", filters: [{ field: "status", op: "eq", value: "approved", label: "Approved" }] },
];

export function LeaveRequestsView({ page, query }: { page: RecordPage<LeaveRequestDTO>; query: RecordQuery }) {
  const router = useRouter();
  const canApprove = useHasPermission("hr:leaverequest:approve");

  const setQuery = React.useCallback(
    (next: RecordQuery) => {
      const sp = queryToSearchParams(next);
      router.push(sp.size ? `/app/hr/leave-requests?${sp}` : "/app/hr/leave-requests", { scroll: false });
    },
    [router]
  );

  async function handleApprove(id: string, employeeId: string) {
    const result = await approveLeaveRequestAction(id, employeeId);
    if (result.ok) {
      toast.success("Leave approved");
      router.refresh();
    } else {
      toast.error(result.error ?? "Could not approve this request");
    }
  }

  async function handleReject(id: string, employeeId: string) {
    const result = await rejectLeaveRequestAction(id, employeeId);
    if (result.ok) {
      toast.success("Leave rejected");
      router.refresh();
    } else {
      toast.error(result.error ?? "Could not reject this request");
    }
  }

  const columns: Column<LeaveRequestDTO>[] = [
    { id: "employee", header: "Employee", cell: (r) => <span className="font-medium text-ink">{r.employeeName}</span> },
    { id: "leaveType", header: "Type", cell: (r) => <span className="text-ink-muted">{r.leaveTypeName}</span> },
    {
      id: "dates",
      header: "Dates",
      sortField: "startDate",
      cell: (r) => (
        <span className="text-ink-muted">
          <DateText value={r.startDate} /> – <DateText value={r.endDate} />
        </span>
      ),
    },
    { id: "days", header: "Days", align: "right", cell: (r) => <span className="tnum">{r.days}</span> },
    {
      id: "status",
      header: "Status",
      sortField: "status",
      width: "120px",
      cell: (r) => (
        <Badge tone={STATUS_TONE[r.status] ?? "neutral"} dot>
          {r.status}
        </Badge>
      ),
    },
    {
      id: "actions",
      header: "",
      width: "90px",
      cell: (r) =>
        r.status === "pending" && canApprove ? (
          <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
            <Button variant="ghost" size="iconSm" aria-label="Approve" onClick={() => void handleApprove(r.id, r.employeeId)}>
              <CheckCircle2 className="text-success" />
            </Button>
            <Button variant="ghost" size="iconSm" aria-label="Reject" onClick={() => void handleReject(r.id, r.employeeId)}>
              <Ban className="text-danger" />
            </Button>
          </div>
        ) : null,
    },
  ];

  return (
    <>
      <PageHeader title="Leave Requests" crumbs={[{ label: "HR" }, { label: "Leave Requests" }]} />

      <FilterBar query={query} onQueryChange={setQuery} quickFilters={QUICK_FILTERS} searchPlaceholder="Search employees, leave types..." />

      <DataTable
        data={page}
        columns={columns}
        query={query}
        onQueryChange={setQuery}
        rowKey={(r) => r.id}
        onRowClick={(r) => router.push(`/app/hr/employees/${r.employeeId}`)}
        emptyTitle="No leave requests match this filter"
        emptyDescription="Requests submitted from an employee's own page show up here."
      />
    </>
  );
}
