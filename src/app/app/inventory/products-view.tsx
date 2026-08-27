"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Download, Package, Plus, Upload } from "lucide-react";
import { PageHeader } from "@/components/erp/page-header";
import { FilterBar, type QuickFilter } from "@/components/erp/filter-bar";
import { DataTable, type Column } from "@/components/erp/data-table";
import { Money, Code } from "@/components/erp/money";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PermissionGate } from "@/components/layout/session-context";
import { queryToSearchParams, type RecordPage, type RecordQuery } from "@/lib/query/record-query";
import type { ProductDTO } from "@/server/catalog/products";

const QUICK_FILTERS: QuickFilter[] = [
  { id: "active", label: "Active", filters: [{ field: "isActive", op: "eq", value: true, label: "Active" }] },
  { id: "goods", label: "Goods", filters: [{ field: "type", op: "eq", value: "goods", label: "Goods" }] },
  { id: "services", label: "Services", filters: [{ field: "type", op: "eq", value: "service", label: "Services" }] },
  { id: "tracked", label: "Lot tracked", filters: [{ field: "tracking", op: "eq", value: "lot", label: "Lot tracked" }] },
];

const GROUPABLE = [
  { field: "category.name", label: "Category" },
  { field: "type", label: "Type" },
  { field: "tracking", label: "Tracking" },
];

export function ProductsView({
  page,
  query,
  live,
}: {
  page: RecordPage<ProductDTO>;
  query: RecordQuery;
  live: boolean;
}) {
  const router = useRouter();

  // The query lives in the URL. Changing it navigates, which re-runs the
  // server component and re-queries Postgres — no client-side data fetching.
  const setQuery = React.useCallback(
    (next: RecordQuery) => {
      const sp = queryToSearchParams(next);
      router.push(sp.size ? `/app/inventory?${sp}` : "/app/inventory", { scroll: false });
    },
    [router]
  );

  const columns: Column<ProductDTO>[] = [
    {
      id: "sku",
      header: "SKU",
      sortField: "sku",
      width: "150px",
      cell: (r) => <Code className="font-medium text-ink">{r.sku}</Code>,
    },
    { id: "name", header: "Name", sortField: "name", cell: (r) => <span className="font-medium">{r.name}</span> },
    {
      id: "category",
      header: "Category",
      sortField: "category.name",
      cell: (r) => <span className="text-ink-muted">{r.categoryName ?? "—"}</span>,
    },
    {
      id: "type",
      header: "Type",
      sortField: "type",
      width: "90px",
      cell: (r) => (
        <Badge tone={r.type === "service" ? "info" : "neutral"}>
          {r.type === "service" ? "Service" : "Goods"}
        </Badge>
      ),
    },
    {
      id: "hsn",
      header: "HSN / SAC",
      optional: true,
      cell: (r) => <Code className="text-xs text-ink-muted">{r.hsnCode ?? "—"}</Code>,
    },
    {
      id: "tracking",
      header: "Tracking",
      sortField: "tracking",
      optional: true,
      cell: (r) =>
        r.tracking === "none" ? (
          <span className="text-ink-subtle">—</span>
        ) : (
          <Badge tone="accent">{r.tracking}</Badge>
        ),
    },
    { id: "uom", header: "Unit", width: "70px", cell: (r) => <span className="text-ink-muted">{r.uomCode}</span> },
    {
      // Layer 4 of the permission model, visible: cost is null for roles
      // without it, because the SERVER never serialised it.
      id: "cost",
      header: "Cost",
      align: "right",
      optional: true,
      cell: (r) =>
        r.costPrice === null ? (
          <span className="text-2xs text-ink-subtle">Hidden</span>
        ) : (
          <Money value={r.costPrice} className="text-ink-muted" />
        ),
    },
    {
      id: "price",
      header: "Sales price",
      sortField: "salesPrice",
      align: "right",
      cell: (r) => <Money value={r.salesPrice} className="font-medium" />,
    },
    {
      id: "status",
      header: "Status",
      sortField: "isActive",
      width: "100px",
      cell: (r) =>
        r.isActive ? (
          <Badge tone="success" dot>
            Active
          </Badge>
        ) : (
          <Badge tone="neutral" dot>
            Archived
          </Badge>
        ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Products"
        crumbs={[{ label: "Inventory" }, { label: "Products" }]}
        meta={
          live
            ? undefined
            : "Demo catalogue — connect a database to manage real products."
        }
        actions={
          <>
            <PermissionGate permission="inventory:product:write">
              <Button variant="secondary" size="md">
                <Upload />
                Import
              </Button>
            </PermissionGate>
            <Button variant="secondary" size="md">
              <Download />
              Export
            </Button>
            <PermissionGate permission="inventory:product:write">
              <Button variant="primary" size="md">
                <Plus />
                New product
              </Button>
            </PermissionGate>
          </>
        }
      />

      <FilterBar
        query={query}
        onQueryChange={setQuery}
        quickFilters={QUICK_FILTERS}
        groupableFields={GROUPABLE}
        searchPlaceholder="Search products by name, SKU or barcode..."
      />

      <DataTable
        data={page}
        columns={columns}
        query={query}
        onQueryChange={setQuery}
        rowKey={(r) => r.id}
        emptyTitle="No products match this filter"
        emptyDescription="Adjust the filters, or add your first product to the catalogue."
        bulkActions={() => (
          <>
            <Button variant="secondary" size="sm">
              <Package />
              Change category
            </Button>
            <Button variant="secondary" size="sm">
              <Download />
              Export
            </Button>
          </>
        )}
      />
    </>
  );
}
