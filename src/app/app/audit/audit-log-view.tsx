"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/erp/page-header";
import { FilterBar, type QuickFilter } from "@/components/erp/filter-bar";
import { DataTable, type Column } from "@/components/erp/data-table";
import { Code } from "@/components/erp/money";
import { Badge } from "@/components/ui/badge";
import { queryToSearchParams, type RecordPage, type RecordQuery } from "@/lib/query/record-query";
import type { AuditLogEntryDTO } from "@/server/core/audit";

const ACTION_TONE: Record<string, "neutral" | "info" | "warning" | "accent" | "success" | "danger"> = {
  created: "info",
  updated: "neutral",
  confirmed: "accent",
  posted: "accent",
  delivered: "accent",
  recorded: "accent",
  allocated: "accent",
  credited: "warning",
  cancelled: "danger",
};

function summarizeChanges(changes: Record<string, { from: unknown; to: unknown }>): string {
  const keys = Object.keys(changes);
  if (keys.length === 0) return "—";
  return keys
    .slice(0, 3)
    .map((k) => `${k}: ${formatValue(changes[k].from)} → ${formatValue(changes[k].to)}`)
    .join(", ") + (keys.length > 3 ? ` (+${keys.length - 3} more)` : "");
}

function formatValue(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

export function AuditLogView({
  page,
  query,
  entityTypes,
}: {
  page: RecordPage<AuditLogEntryDTO>;
  query: RecordQuery;
  entityTypes: string[];
}) {
  const router = useRouter();

  const setQuery = React.useCallback(
    (next: RecordQuery) => {
      const sp = queryToSearchParams(next);
      router.push(sp.size ? `/app/audit?${sp}` : "/app/audit", { scroll: false });
    },
    [router]
  );

  const quickFilters: QuickFilter[] = React.useMemo(
    () => [
      { id: "cancellations", label: "Cancellations", filters: [{ field: "action", op: "eq", value: "cancelled", label: "Cancelled" }] },
      { id: "creations", label: "Created", filters: [{ field: "action", op: "eq", value: "created", label: "Created" }] },
      ...entityTypes.slice(0, 4).map((t) => ({
        id: `entity-${t}`,
        label: t,
        filters: [{ field: "entityType", op: "eq" as const, value: t, label: t }],
      })),
    ],
    [entityTypes]
  );

  const columns: Column<AuditLogEntryDTO>[] = [
    {
      id: "at",
      header: "When",
      sortField: "at",
      width: "170px",
      cell: (r) => <span className="tnum text-ink-muted">{new Date(r.at).toLocaleString()}</span>,
    },
    {
      id: "entity",
      header: "Record",
      sortField: "entityType",
      cell: (r) => (
        <span>
          <span className="font-medium text-ink">{r.entityType}</span>{" "}
          <Code className="text-2xs text-ink-subtle">{r.entityId.slice(0, 8)}</Code>
        </span>
      ),
    },
    {
      id: "action",
      header: "Action",
      sortField: "action",
      width: "120px",
      cell: (r) => (
        <Badge tone={ACTION_TONE[r.action] ?? "neutral"} dot>
          {r.action}
        </Badge>
      ),
    },
    { id: "actor", header: "By", sortField: "actorName", cell: (r) => <span className="text-ink-muted">{r.actorName}</span> },
    {
      id: "changes",
      header: "Changes",
      optional: true,
      cell: (r) => <span className="truncate text-2xs text-ink-subtle">{summarizeChanges(r.changes)}</span>,
    },
  ];

  return (
    <>
      <PageHeader title="Audit Log" crumbs={[{ label: "Setup" }, { label: "Audit Log" }]} meta="Every create, confirm, post and cancel across every module, in one place." />

      <FilterBar
        query={query}
        onQueryChange={setQuery}
        quickFilters={quickFilters}
        searchPlaceholder="Search by record type, action, or who did it..."
      />

      <DataTable
        data={page}
        columns={columns}
        query={query}
        onQueryChange={setQuery}
        rowKey={(r) => r.id}
        emptyTitle="No activity matches this filter"
        emptyDescription="Try clearing a filter, or check back once something happens."
      />
    </>
  );
}
