"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Download, Plus } from "lucide-react";
import { PageHeader } from "@/components/erp/page-header";
import { FilterBar, type QuickFilter } from "@/components/erp/filter-bar";
import { DataTable, type Column } from "@/components/erp/data-table";
import { Money, DateText, Code, Quantity } from "@/components/erp/money";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PermissionGate } from "@/components/layout/session-context";
import { queryToSearchParams, type RecordPage, type RecordQuery } from "@/lib/query/record-query";
import type { SalesOrderListItemDTO } from "@/server/sales/orders";

const STATUS_TONE: Record<string, "neutral" | "info" | "warning" | "accent" | "success" | "danger"> = {
  draft: "neutral",
  confirmed: "info",
  partially_delivered: "warning",
  delivered: "accent",
  invoiced: "success",
  cancelled: "danger",
};

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  confirmed: "Confirmed",
  partially_delivered: "Part. delivered",
  delivered: "Delivered",
  invoiced: "Invoiced",
  cancelled: "Cancelled",
};

const QUICK_FILTERS: QuickFilter[] = [
  { id: "open", label: "Open", filters: [{ field: "status", op: "in", value: ["confirmed", "partially_delivered"], label: "Open" }] },
  { id: "draft", label: "Drafts", filters: [{ field: "status", op: "eq", value: "draft", label: "Draft" }] },
];

const GROUPABLE = [
  { field: "status", label: "Status" },
  { field: "partnerName", label: "Customer" },
  { field: "warehouseName", label: "Warehouse" },
];

export function SalesOrdersView({
  page,
  query,
  live,
}: {
  page: RecordPage<SalesOrderListItemDTO>;
  query: RecordQuery;
  live: boolean;
}) {
  const router = useRouter();

  const setQuery = React.useCallback(
    (next: RecordQuery) => {
      const sp = queryToSearchParams(next);
      router.push(sp.size ? `/app/sales?${sp}` : "/app/sales", { scroll: false });
    },
    [router]
  );

  const columns: Column<SalesOrderListItemDTO>[] = [
    { id: "number", header: "Number", sortField: "number", width: "150px", cell: (r) => <Code className="font-medium text-ink">{r.number}</Code> },
    { id: "customer", header: "Customer", sortField: "partner.name", cell: (r) => <span className="font-medium">{r.partnerName}</span> },
    { id: "orderDate", header: "Order date", sortField: "orderDate", cell: (r) => <DateText value={r.orderDate} className="text-ink-muted" /> },
    { id: "salesperson", header: "Salesperson", optional: true, cell: (r) => <span className="text-ink-muted">{r.salespersonName ?? "—"}</span> },
    { id: "warehouse", header: "Warehouse", optional: true, cell: (r) => <span className="text-ink-muted">{r.warehouseName}</span> },
    {
      id: "fulfilment",
      header: "Delivered",
      align: "right",
      cell: (r) => (
        <span className="tnum text-ink-muted">
          <Quantity value={r.qtyDelivered} />
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
        title="Sales Orders"
        crumbs={[{ label: "Sales", href: "/app/sales" }, { label: "Orders" }]}
        meta={live ? undefined : "Demo orders — connect a database to manage real sales."}
        actions={
          <>
            <Button variant="secondary" size="md">
              <Download />
              Export
            </Button>
            <PermissionGate permission="sales:order:write">
              {live ? (
                <Button variant="primary" size="md" asChild>
                  <Link href="/app/sales/new">
                    <Plus />
                    New order
                  </Link>
                </Button>
              ) : (
                <Button variant="primary" size="md" disabled>
                  <Plus />
                  New order
                </Button>
              )}
            </PermissionGate>
          </>
        }
      />

      <FilterBar
        query={query}
        onQueryChange={setQuery}
        quickFilters={QUICK_FILTERS}
        groupableFields={GROUPABLE}
        searchPlaceholder="Search orders, customers..."
      />

      <DataTable
        data={page}
        columns={columns}
        query={query}
        onQueryChange={setQuery}
        rowKey={(r) => r.id}
        onRowClick={live ? (r) => router.push(`/app/sales/${r.id}`) : undefined}
        emptyTitle="No orders match this filter"
        emptyDescription={live ? "Try clearing a filter, or create the first order." : "Connect a database to manage real orders."}
      />
    </>
  );
}
