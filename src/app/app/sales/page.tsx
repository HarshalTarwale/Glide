"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Download, Plus, Tag, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/erp/page-header";
import { FilterBar, type QuickFilter } from "@/components/erp/filter-bar";
import { DataTable, type Column } from "@/components/erp/data-table";
import { Money, DateText, Code, Quantity } from "@/components/erp/money";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  EMPTY_QUERY,
  queryToSearchParams,
  searchParamsToQuery,
  runQuery,
  type RecordQuery,
  type SavedView,
} from "@/lib/query/record-query";
import { SALES_ORDERS, STATUS_META, type SalesOrder } from "@/lib/mock/sales-orders";

const QUICK_FILTERS: QuickFilter[] = [
  { id: "open", label: "Open", filters: [{ field: "status", op: "in", value: ["confirmed", "partially_delivered"], label: "Open" }] },
  { id: "undelivered", label: "Awaiting delivery", filters: [{ field: "qtyDelivered", op: "eq", value: 0, label: "Awaiting delivery" }] },
  { id: "mine", label: "My orders", filters: [{ field: "salesperson", op: "eq", value: "A. Hazari", label: "My orders" }] },
];

const GROUPABLE = [
  { field: "status", label: "Status" },
  { field: "customer", label: "Customer" },
  { field: "salesperson", label: "Salesperson" },
  { field: "warehouse", label: "Warehouse" },
];

const SAVED_VIEWS: SavedView[] = [
  { id: "v1", name: "All orders", query: EMPTY_QUERY, shared: true, isDefault: true },
  {
    id: "v2",
    name: "Ready to invoice",
    query: { ...EMPTY_QUERY, filters: [{ field: "status", op: "eq", value: "delivered", label: "Delivered" }] },
    shared: true,
    isDefault: false,
  },
];

function SalesOrdersView() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const query = React.useMemo<RecordQuery>(
    () => searchParamsToQuery(new URLSearchParams(searchParams.toString())),
    [searchParams]
  );

  // The list view lives in the URL: shareable, back-button-safe, bookmarkable.
  const setQuery = React.useCallback(
    (q: RecordQuery) => {
      const sp = queryToSearchParams(q);
      router.replace(sp.size ? `/app/sales?${sp}` : "/app/sales", { scroll: false });
    },
    [router]
  );

  const page = React.useMemo(
    () => runQuery(SALES_ORDERS, query, ["number", "customer", "salesperson"]),
    [query]
  );

  const columns: Column<SalesOrder>[] = [
    {
      id: "number",
      header: "Number",
      sortField: "number",
      width: "110px",
      cell: (r) => <Code className="font-medium text-ink">{r.number}</Code>,
    },
    { id: "customer", header: "Customer", sortField: "customer", cell: (r) => <span className="font-medium">{r.customer}</span> },
    { id: "orderDate", header: "Order date", sortField: "orderDate", cell: (r) => <DateText value={r.orderDate} className="text-ink-muted" /> },
    {
      id: "deliveryDate",
      header: "Delivery",
      sortField: "deliveryDate",
      optional: true,
      cell: (r) => <DateText value={r.deliveryDate} className="text-ink-muted" />,
    },
    { id: "salesperson", header: "Salesperson", sortField: "salesperson", optional: true, cell: (r) => <span className="text-ink-muted">{r.salesperson}</span> },
    { id: "warehouse", header: "Warehouse", sortField: "warehouse", optional: true, cell: (r) => <span className="text-ink-muted">{r.warehouse}</span> },
    {
      // Partial fulfilment made visible: the delivered/ordered ratio is the
      // number an operations person actually scans for.
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
    { id: "tax", header: "Tax", sortField: "tax", align: "right", optional: true, cell: (r) => <Money value={r.tax} className="text-ink-muted" /> },
    { id: "total", header: "Total", sortField: "total", align: "right", cell: (r) => <Money value={r.total} className="font-medium" /> },
    {
      id: "status",
      header: "Status",
      sortField: "status",
      width: "130px",
      cell: (r) => {
        const m = STATUS_META[r.status];
        return (
          <Badge tone={m.tone} dot>
            {m.label}
          </Badge>
        );
      },
    },
  ];

  return (
    <>
      <PageHeader
        title="Sales Orders"
        crumbs={[{ label: "Sales", href: "/app/sales" }, { label: "Orders" }]}
        actions={
          <>
            <Button variant="secondary" size="md">
              <Download />
              Export
            </Button>
            <Button variant="primary" size="md">
              <Plus />
              New order
            </Button>
          </>
        }
      />

      <FilterBar
        query={query}
        onQueryChange={setQuery}
        quickFilters={QUICK_FILTERS}
        groupableFields={GROUPABLE}
        savedViews={SAVED_VIEWS}
        activeViewId="v1"
        onSelectView={(v) => setQuery(v.query)}
        searchPlaceholder="Search orders, customers, salespeople..."
      />

      <DataTable
        data={page}
        columns={columns}
        query={query}
        onQueryChange={setQuery}
        rowKey={(r) => r.id}
        onRowClick={(r) => router.push(`/app/sales/${r.id}`)}
        emptyTitle="No orders match this filter"
        emptyDescription="Try clearing a filter, or create the first order for this period."
        bulkActions={() => (
          <>
            <Button variant="secondary" size="sm">
              <Tag />
              Change status
            </Button>
            <Button variant="secondary" size="sm">
              <Download />
              Export
            </Button>
            <Button variant="ghost" size="sm" className="text-danger hover:bg-danger-soft">
              <Trash2 />
              Delete
            </Button>
          </>
        )}
      />
    </>
  );
}

export default function SalesOrdersPage() {
  return (
    <React.Suspense fallback={<div className="p-6 text-sm text-ink-subtle">Loading...</div>}>
      <SalesOrdersView />
    </React.Suspense>
  );
}
