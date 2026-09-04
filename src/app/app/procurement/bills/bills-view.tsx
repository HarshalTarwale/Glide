"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Download, Plus } from "lucide-react";
import { PageHeader } from "@/components/erp/page-header";
import { FilterBar, type QuickFilter } from "@/components/erp/filter-bar";
import { DataTable, type Column } from "@/components/erp/data-table";
import { Money, DateText, Code } from "@/components/erp/money";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PermissionGate } from "@/components/layout/session-context";
import { queryToSearchParams, type RecordPage, type RecordQuery } from "@/lib/query/record-query";
import type { BillListItemDTO } from "@/server/procurement/bills";

const STATUS_TONE: Record<string, "neutral" | "info" | "warning" | "accent" | "success" | "danger"> = {
  draft: "neutral",
  posted: "info",
  partially_paid: "warning",
  paid: "success",
  cancelled: "danger",
};

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  posted: "Posted",
  partially_paid: "Part. paid",
  paid: "Paid",
  cancelled: "Cancelled",
};

const QUICK_FILTERS: QuickFilter[] = [
  { id: "open", label: "Open", filters: [{ field: "status", op: "in", value: ["posted", "partially_paid"], label: "Open" }] },
  { id: "overdue", label: "Overdue", filters: [{ field: "dueDate", op: "lt", value: new Date().toISOString(), label: "Overdue" }] },
  { id: "draft", label: "Drafts", filters: [{ field: "status", op: "eq", value: "draft", label: "Draft" }] },
];

export function BillsView({ page, query }: { page: RecordPage<BillListItemDTO>; query: RecordQuery }) {
  const router = useRouter();

  const setQuery = React.useCallback(
    (next: RecordQuery) => {
      const sp = queryToSearchParams(next);
      router.push(sp.size ? `/app/procurement/bills?${sp}` : "/app/procurement/bills", { scroll: false });
    },
    [router]
  );

  const columns: Column<BillListItemDTO>[] = [
    { id: "number", header: "Number", sortField: "number", width: "150px", cell: (r) => <Code className="font-medium text-ink">{r.number}</Code> },
    { id: "supplier", header: "Supplier", sortField: "partner.name", cell: (r) => <span className="font-medium">{r.partnerName}</span> },
    { id: "billDate", header: "Bill date", sortField: "billDate", cell: (r) => <DateText value={r.billDate} className="text-ink-muted" /> },
    { id: "dueDate", header: "Due", optional: true, cell: (r) => (r.dueDate ? <DateText value={r.dueDate} className="text-ink-muted" /> : <span className="text-ink-subtle">—</span>) },
    { id: "total", header: "Total", sortField: "total", align: "right", cell: (r) => <Money value={r.total} className="font-medium" /> },
    { id: "outstanding", header: "Outstanding", align: "right", cell: (r) => <Money value={r.outstanding} className={r.outstanding > 0 ? "text-danger" : "text-ink-muted"} /> },
    {
      id: "status",
      header: "Status",
      sortField: "status",
      width: "130px",
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
        title="Bills"
        crumbs={[{ label: "Procurement" }, { label: "Bills" }]}
        actions={
          <>
            <Button variant="secondary" size="md" asChild>
              <Link href="/app/procurement/aging">
                <Download />
                AP aging
              </Link>
            </Button>
            <PermissionGate permission="procurement:bill:write">
              <Button variant="primary" size="md" asChild>
                <Link href="/app/procurement/bills/new">
                  <Plus />
                  New bill
                </Link>
              </Button>
            </PermissionGate>
          </>
        }
      />

      <FilterBar query={query} onQueryChange={setQuery} quickFilters={QUICK_FILTERS} searchPlaceholder="Search bills, suppliers..." />

      <DataTable
        data={page}
        columns={columns}
        query={query}
        onQueryChange={setQuery}
        rowKey={(r) => r.id}
        onRowClick={(r) => router.push(`/app/procurement/bills/${r.id}`)}
        emptyTitle="No bills match this filter"
        emptyDescription="Try clearing a filter, or create the first bill."
      />
    </>
  );
}
