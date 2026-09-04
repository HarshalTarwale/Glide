"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/erp/page-header";
import { FilterBar, type QuickFilter } from "@/components/erp/filter-bar";
import { DataTable, type Column } from "@/components/erp/data-table";
import { Money, DateText, Code, Quantity } from "@/components/erp/money";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PermissionGate } from "@/components/layout/session-context";
import { queryToSearchParams, type RecordPage, type RecordQuery } from "@/lib/query/record-query";
import type { PurchaseOrderListItemDTO } from "@/server/procurement/orders";

const STATUS_TONE: Record<string, "neutral" | "info" | "warning" | "accent" | "success" | "danger"> = {
  draft: "neutral",
  confirmed: "info",
  partially_received: "warning",
  received: "accent",
  billed: "success",
  cancelled: "danger",
};

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  confirmed: "Confirmed",
  partially_received: "Part. received",
  received: "Received",
  billed: "Billed",
  cancelled: "Cancelled",
};

const QUICK_FILTERS: QuickFilter[] = [
  { id: "open", label: "Open", filters: [{ field: "status", op: "in", value: ["confirmed", "partially_received"], label: "Open" }] },
  { id: "draft", label: "Drafts", filters: [{ field: "status", op: "eq", value: "draft", label: "Draft" }] },
];

export function PurchaseOrdersView({ page, query }: { page: RecordPage<PurchaseOrderListItemDTO>; query: RecordQuery }) {
  const router = useRouter();

  const setQuery = React.useCallback(
    (next: RecordQuery) => {
      const sp = queryToSearchParams(next);
      router.push(sp.size ? `/app/procurement/orders?${sp}` : "/app/procurement/orders", { scroll: false });
    },
    [router]
  );

  const columns: Column<PurchaseOrderListItemDTO>[] = [
    { id: "number", header: "Number", sortField: "number", width: "150px", cell: (r) => <Code className="font-medium text-ink">{r.number}</Code> },
    { id: "supplier", header: "Supplier", sortField: "partner.name", cell: (r) => <span className="font-medium">{r.partnerName}</span> },
    { id: "orderDate", header: "Order date", sortField: "orderDate", cell: (r) => <DateText value={r.orderDate} className="text-ink-muted" /> },
    { id: "warehouse", header: "Warehouse", optional: true, cell: (r) => <span className="text-ink-muted">{r.warehouseName}</span> },
    {
      id: "fulfilment",
      header: "Received",
      align: "right",
      cell: (r) => (
        <span className="tnum text-ink-muted">
          <Quantity value={r.qtyReceived} />
          <span className="text-ink-subtle"> / </span>
          <Quantity value={r.qtyOrdered} />
        </span>
      ),
    },
    { id: "total", header: "Total", sortField: "total", align: "right", cell: (r) => <Money value={r.total} className="font-medium" /> },
    {
      id: "status",
      header: "Status",
      sortField: "status",
      width: "140px",
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
        title="Purchase Orders"
        crumbs={[{ label: "Procurement" }, { label: "Orders" }]}
        actions={
          <PermissionGate permission="procurement:order:write">
            <Button variant="primary" size="md" asChild>
              <Link href="/app/procurement/orders/new">
                <Plus />
                New order
              </Link>
            </Button>
          </PermissionGate>
        }
      />

      <FilterBar query={query} onQueryChange={setQuery} quickFilters={QUICK_FILTERS} searchPlaceholder="Search orders, suppliers..." />

      <DataTable
        data={page}
        columns={columns}
        query={query}
        onQueryChange={setQuery}
        rowKey={(r) => r.id}
        onRowClick={(r) => router.push(`/app/procurement/orders/${r.id}`)}
        emptyTitle="No purchase orders match this filter"
        emptyDescription="Try clearing a filter, or create the first order."
      />
    </>
  );
}
