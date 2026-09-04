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
import type { LeadDTO } from "@/server/crm/leads";

const STATUS_TONE: Record<string, "neutral" | "info" | "warning" | "accent" | "success" | "danger"> = {
  new: "neutral",
  contacted: "info",
  qualified: "accent",
  unqualified: "danger",
  converted: "success",
};

const STATUS_LABEL: Record<string, string> = {
  new: "New",
  contacted: "Contacted",
  qualified: "Qualified",
  unqualified: "Unqualified",
  converted: "Converted",
};

const QUICK_FILTERS: QuickFilter[] = [
  { id: "open", label: "Open", filters: [{ field: "status", op: "in", value: ["new", "contacted", "qualified"], label: "Open" }] },
  { id: "converted", label: "Converted", filters: [{ field: "status", op: "eq", value: "converted", label: "Converted" }] },
];

export function LeadsView({ page, query }: { page: RecordPage<LeadDTO>; query: RecordQuery }) {
  const router = useRouter();

  const setQuery = React.useCallback(
    (next: RecordQuery) => {
      const sp = queryToSearchParams(next);
      router.push(sp.size ? `/app/crm/leads?${sp}` : "/app/crm/leads", { scroll: false });
    },
    [router]
  );

  const columns: Column<LeadDTO>[] = [
    { id: "name", header: "Name", sortField: "name", cell: (r) => <span className="font-medium text-ink">{r.name}</span> },
    { id: "company", header: "Company", sortField: "companyName", cell: (r) => <span className="text-ink-muted">{r.companyName ?? "—"}</span> },
    { id: "email", header: "Email", optional: true, cell: (r) => <span className="text-ink-muted">{r.email ?? "—"}</span> },
    { id: "source", header: "Source", optional: true, cell: (r) => <span className="text-ink-muted capitalize">{r.source.replace("_", " ")}</span> },
    { id: "owner", header: "Owner", optional: true, cell: (r) => <span className="text-ink-muted">{r.ownerName ?? "—"}</span> },
    { id: "createdAt", header: "Created", sortField: "createdAt", cell: (r) => <DateText value={r.createdAt} className="text-ink-muted" /> },
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
        title="Leads"
        crumbs={[{ label: "CRM" }, { label: "Leads" }]}
        actions={
          <PermissionGate permission="crm:lead:write">
            <Button variant="primary" size="md" asChild>
              <Link href="/app/crm/leads/new">
                <Plus />
                New lead
              </Link>
            </Button>
          </PermissionGate>
        }
      />

      <FilterBar query={query} onQueryChange={setQuery} quickFilters={QUICK_FILTERS} searchPlaceholder="Search leads, companies..." />

      <DataTable
        data={page}
        columns={columns}
        query={query}
        onQueryChange={setQuery}
        rowKey={(r) => r.id}
        onRowClick={(r) => router.push(`/app/crm/leads/${r.id}`)}
        emptyTitle="No leads match this filter"
        emptyDescription="Try clearing a filter, or capture the first lead."
      />
    </>
  );
}
