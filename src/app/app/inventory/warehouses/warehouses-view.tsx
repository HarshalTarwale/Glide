"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Archive, MapPin, Plus } from "lucide-react";
import { PageHeader } from "@/components/erp/page-header";
import { DataTable, type Column } from "@/components/erp/data-table";
import { Code } from "@/components/erp/money";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PermissionGate, useHasPermission, useSession } from "@/components/layout/session-context";
import { queryToSearchParams, type RecordPage, type RecordQuery } from "@/lib/query/record-query";
import type { WarehouseDTO } from "@/server/inventory/warehouses";
import { WarehouseForm } from "./warehouse-form";
import { archiveWarehouseAction } from "./actions";

export function WarehousesView({
  page,
  query,
  live,
}: {
  page: RecordPage<WarehouseDTO>;
  query: RecordQuery;
  live: boolean;
}) {
  const router = useRouter();
  const session = useSession();
  const canWrite = useHasPermission("inventory:warehouse:write");
  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<WarehouseDTO | null>(null);

  const setQuery = React.useCallback(
    (next: RecordQuery) => {
      const sp = queryToSearchParams(next);
      router.push(sp.size ? `/app/inventory/warehouses?${sp}` : "/app/inventory/warehouses", { scroll: false });
    },
    [router]
  );

  function openCreate() {
    setEditing(null);
    setFormOpen(true);
  }

  function openEdit(warehouse: WarehouseDTO) {
    if (!live || !canWrite) return;
    setEditing(warehouse);
    setFormOpen(true);
  }

  function handleSaved() {
    toast.success(editing ? "Warehouse updated" : "Warehouse created");
    router.refresh();
  }

  async function handleArchive(id: string, name: string) {
    const result = await archiveWarehouseAction(id);
    if (result.ok) {
      toast.success(`${name} archived`);
      router.refresh();
    } else {
      toast.error(result.error ?? "Could not archive warehouse");
    }
  }

  const columns: Column<WarehouseDTO>[] = [
    {
      id: "code",
      header: "Code",
      sortField: "code",
      width: "110px",
      cell: (r) => <Code className="font-medium text-ink">{r.code}</Code>,
    },
    { id: "name", header: "Name", sortField: "name", cell: (r) => <span className="font-medium">{r.name}</span> },
    {
      id: "location",
      header: "Location",
      cell: (r) => (
        <span className="flex items-center gap-1.5 text-ink-muted">
          <MapPin className="size-3 shrink-0 text-ink-subtle" />
          {[r.city, r.region].filter(Boolean).join(", ") || "—"}
        </span>
      ),
    },
    {
      id: "locationCount",
      header: "Stock locations",
      align: "right",
      cell: (r) => <span className="tnum text-ink-muted">{r.locationCount}</span>,
    },
    {
      id: "status",
      header: "Status",
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

  if (live && canWrite) {
    columns.push({
      id: "rowActions",
      header: "",
      width: "40px",
      cell: (r) =>
        r.isActive ? (
          <Button
            variant="ghost"
            size="iconSm"
            aria-label={`Archive ${r.name}`}
            onClick={(e) => {
              e.stopPropagation();
              void handleArchive(r.id, r.name);
            }}
          >
            <Archive className="text-ink-subtle" />
          </Button>
        ) : null,
    });
  }

  return (
    <>
      <PageHeader
        title="Warehouses"
        crumbs={[{ label: "Inventory", href: "/app/inventory" }, { label: "Warehouses" }]}
        meta={live ? undefined : "Demo warehouse — connect a database to manage real locations."}
        actions={
          <PermissionGate permission="inventory:warehouse:write">
            <Button variant="primary" size="md" onClick={openCreate} disabled={!live}>
              <Plus />
              New warehouse
            </Button>
          </PermissionGate>
        }
      />

      <DataTable
        data={page}
        columns={columns}
        query={query}
        onQueryChange={setQuery}
        rowKey={(r) => r.id}
        onRowClick={live && canWrite ? openEdit : undefined}
        emptyTitle="No warehouses yet"
        emptyDescription={
          live ? "Add your first warehouse to start tracking stock." : "Connect a database to add real warehouses."
        }
      />

      {live ? (
        <WarehouseForm
          open={formOpen}
          onOpenChange={setFormOpen}
          warehouse={editing}
          defaultCountry={session.country}
          onSaved={handleSaved}
        />
      ) : null}
    </>
  );
}
