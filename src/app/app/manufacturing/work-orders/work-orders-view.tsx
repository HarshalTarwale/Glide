"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/erp/page-header";
import { FilterBar, type QuickFilter } from "@/components/erp/filter-bar";
import { DataTable, type Column } from "@/components/erp/data-table";
import { DateText, Code } from "@/components/erp/money";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PermissionGate } from "@/components/layout/session-context";
import { queryToSearchParams, type RecordPage, type RecordQuery } from "@/lib/query/record-query";
import type { WorkOrderDTO } from "@/server/manufacturing/work-orders";

const STATUS_TONE: Record<string, "neutral" | "info" | "warning" | "accent" | "success" | "danger"> = {
  draft: "neutral",
  confirmed: "info",
  done: "success",
  cancelled: "danger",
};

const QUICK_FILTERS: QuickFilter[] = [
  { id: "open", label: "Open", filters: [{ field: "status", op: "in", value: ["draft", "confirmed"], label: "Open" }] },
  { id: "done", label: "Done", filters: [{ field: "status", op: "eq", value: "done", label: "Done" }] },
];

export function WorkOrdersView({ page, query }: { page: RecordPage<WorkOrderDTO>; query: RecordQuery }) {
  const router = useRouter();

  const setQuery = React.useCallback(
    (next: RecordQuery) => {
      const sp = queryToSearchParams(next);
      router.push(sp.size ? `/app/manufacturing/work-orders?${sp}` : "/app/manufacturing/work-orders", { scroll: false });
    },
    [router]
  );

  const columns: Column<WorkOrderDTO>[] = [
    { id: "number", header: "Number", sortField: "number", width: "150px", cell: (r) => <Code className="font-medium text-ink">{r.number}</Code> },
    { id: "product", header: "Product", cell: (r) => <span className="font-medium">{r.productName}</span> },
    { id: "warehouse", header: "Warehouse", optional: true, cell: (r) => <span className="text-ink-muted">{r.warehouseName}</span> },
    { id: "quantity", header: "Qty", sortField: "quantity", align: "right", cell: (r) => <span className="tnum">{r.quantity}</span> },
    { id: "scheduledDate", header: "Scheduled", optional: true, cell: (r) => (r.scheduledDate ? <DateText value={r.scheduledDate} className="text-ink-muted" /> : <span className="text-ink-subtle">—</span>) },
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
  ];

  return (
    <>
      <PageHeader
        title="Work Orders"
        crumbs={[{ label: "Manufacturing" }, { label: "Work Orders" }]}
        actions={
          <PermissionGate permission="manufacturing:workorder:write">
            <Button variant="primary" size="md" asChild>
              <Link href="/app/manufacturing/work-orders/new">
                <Plus />
                New work order
              </Link>
            </Button>
          </PermissionGate>
        }
      />

      <FilterBar query={query} onQueryChange={setQuery} quickFilters={QUICK_FILTERS} searchPlaceholder="Search work orders, products..." />

      <DataTable
        data={page}
        columns={columns}
        query={query}
        onQueryChange={setQuery}
        rowKey={(r) => r.id}
        onRowClick={(r) => router.push(`/app/manufacturing/work-orders/${r.id}`)}
        emptyTitle="No work orders match this filter"
        emptyDescription="Try clearing a filter, or create the first work order."
      />
    </>
  );
}
