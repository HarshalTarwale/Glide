"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/erp/page-header";
import { FilterBar, type QuickFilter } from "@/components/erp/filter-bar";
import { DataTable, type Column } from "@/components/erp/data-table";
import { Money, DateText, Code } from "@/components/erp/money";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PermissionGate } from "@/components/layout/session-context";
import { queryToSearchParams, type RecordPage, type RecordQuery } from "@/lib/query/record-query";
import type { JournalEntryListItemDTO } from "@/server/accounting/journal-entries";

const STATUS_TONE: Record<string, "neutral" | "success"> = { draft: "neutral", posted: "success" };
const STATUS_LABEL: Record<string, string> = { draft: "Draft", posted: "Posted" };

const QUICK_FILTERS: QuickFilter[] = [
  { id: "draft", label: "Drafts", filters: [{ field: "status", op: "eq", value: "draft", label: "Draft" }] },
  { id: "posted", label: "Posted", filters: [{ field: "status", op: "eq", value: "posted", label: "Posted" }] },
];

export function JournalView({ page, query }: { page: RecordPage<JournalEntryListItemDTO>; query: RecordQuery }) {
  const router = useRouter();

  const setQuery = React.useCallback(
    (next: RecordQuery) => {
      const sp = queryToSearchParams(next);
      router.push(sp.size ? `/app/accounting/journal?${sp}` : "/app/accounting/journal", { scroll: false });
    },
    [router]
  );

  const columns: Column<JournalEntryListItemDTO>[] = [
    { id: "number", header: "Number", sortField: "number", width: "150px", cell: (r) => <Code className="font-medium text-ink">{r.number}</Code> },
    { id: "date", header: "Date", sortField: "date", cell: (r) => <DateText value={r.date} className="text-ink-muted" /> },
    { id: "description", header: "Description", cell: (r) => <span>{r.description}</span> },
    { id: "source", header: "Source", optional: true, cell: (r) => <span className="text-ink-muted">{r.sourceType ?? "Manual"}</span> },
    { id: "total", header: "Total", sortField: "total", align: "right", cell: (r) => <Money value={r.total} className="font-medium" /> },
    {
      id: "status",
      header: "Status",
      sortField: "status",
      width: "110px",
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
        title="Journal Entries"
        crumbs={[{ label: "Accounting" }, { label: "Journal Entries" }]}
        meta="Every posting to the general ledger — automatic from invoices and payments, or entered by hand."
        actions={
          <PermissionGate permission="accounting:journal:write">
            <Button variant="primary" size="md" asChild>
              <Link href="/app/accounting/journal/new">
                <Plus />
                New entry
              </Link>
            </Button>
          </PermissionGate>
        }
      />

      <FilterBar query={query} onQueryChange={setQuery} quickFilters={QUICK_FILTERS} searchPlaceholder="Search entries..." />

      <DataTable
        data={page}
        columns={columns}
        query={query}
        onQueryChange={setQuery}
        rowKey={(r) => r.id}
        onRowClick={(r) => router.push(`/app/accounting/journal/${r.id}`)}
        emptyTitle="No journal entries match this filter"
        emptyDescription="Try clearing a filter, or post an invoice to see one appear automatically."
      />
    </>
  );
}
