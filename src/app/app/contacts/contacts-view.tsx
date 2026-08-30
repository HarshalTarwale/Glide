"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Archive, Download, Plus } from "lucide-react";
import { PageHeader } from "@/components/erp/page-header";
import { FilterBar, type QuickFilter } from "@/components/erp/filter-bar";
import { DataTable, type Column } from "@/components/erp/data-table";
import { Code } from "@/components/erp/money";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PermissionGate, useHasPermission, useSession } from "@/components/layout/session-context";
import { queryToSearchParams, type RecordPage, type RecordQuery } from "@/lib/query/record-query";
import type { PartnerDTO } from "@/server/core/partners";
import { PartnerForm } from "./partner-form";
import { archivePartnerAction } from "./actions";

const QUICK_FILTERS: QuickFilter[] = [
  { id: "customers", label: "Customers", filters: [{ field: "isCustomer", op: "eq", value: true, label: "Customers" }] },
  { id: "suppliers", label: "Suppliers", filters: [{ field: "isSupplier", op: "eq", value: true, label: "Suppliers" }] },
];

export function ContactsView({
  page,
  query,
  live,
}: {
  page: RecordPage<PartnerDTO>;
  query: RecordQuery;
  live: boolean;
}) {
  const router = useRouter();
  const session = useSession();
  const canWrite = useHasPermission("core:partner:write");
  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<PartnerDTO | null>(null);

  const setQuery = React.useCallback(
    (next: RecordQuery) => {
      const sp = queryToSearchParams(next);
      router.push(sp.size ? `/app/contacts?${sp}` : "/app/contacts", { scroll: false });
    },
    [router]
  );

  function openCreate() {
    setEditing(null);
    setFormOpen(true);
  }

  function openEdit(partner: PartnerDTO) {
    if (!live || !canWrite) return;
    setEditing(partner);
    setFormOpen(true);
  }

  function handleSaved() {
    toast.success(editing ? "Contact updated" : "Contact created");
    router.refresh();
  }

  async function handleArchive(id: string, name: string) {
    const result = await archivePartnerAction(id);
    if (result.ok) {
      toast.success(`${name} archived`);
      router.refresh();
    } else {
      toast.error(result.error ?? "Could not archive contact");
    }
  }

  const columns: Column<PartnerDTO>[] = [
    {
      id: "name",
      header: "Name",
      sortField: "name",
      cell: (r) => (
        <div>
          <div className="font-medium text-ink">{r.name}</div>
          {r.code ? <Code className="text-2xs text-ink-subtle">{r.code}</Code> : null}
        </div>
      ),
    },
    {
      id: "kind",
      header: "Type",
      width: "90px",
      cell: (r) => (
        <div className="flex flex-wrap gap-1">
          {r.isCustomer ? <Badge tone="accent">Customer</Badge> : null}
          {r.isSupplier ? <Badge tone="info">Supplier</Badge> : null}
          {!r.isCustomer && !r.isSupplier ? <span className="text-ink-subtle">—</span> : null}
        </div>
      ),
    },
    { id: "email", header: "Email", optional: true, cell: (r) => <span className="text-ink-muted">{r.email ?? "—"}</span> },
    { id: "phone", header: "Phone", optional: true, cell: (r) => <span className="text-ink-muted tnum">{r.phone ?? "—"}</span> },
    {
      id: "location",
      header: "Location",
      cell: (r) => (
        <span className="text-ink-muted">
          {[r.billingCity, r.billingRegion].filter(Boolean).join(", ") || "—"}
        </span>
      ),
    },
    {
      id: "taxId",
      header: "Tax ID",
      optional: true,
      cell: (r) => <Code className="text-xs text-ink-muted">{r.taxId ?? "—"}</Code>,
    },
    {
      id: "terms",
      header: "Terms",
      align: "right",
      optional: true,
      cell: (r) => <span className="text-ink-muted tnum">{r.paymentTermDays}d</span>,
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
        title="Contacts"
        crumbs={[{ label: "Relationships" }, { label: "Contacts" }]}
        meta={live ? undefined : "Demo contacts — connect a database to manage real customers and suppliers."}
        actions={
          <>
            <Button variant="secondary" size="md">
              <Download />
              Export
            </Button>
            <PermissionGate permission="core:partner:write">
              <Button variant="primary" size="md" onClick={openCreate} disabled={!live}>
                <Plus />
                New contact
              </Button>
            </PermissionGate>
          </>
        }
      />

      <FilterBar
        query={query}
        onQueryChange={setQuery}
        quickFilters={QUICK_FILTERS}
        searchPlaceholder="Search contacts by name, code or email..."
      />

      <DataTable
        data={page}
        columns={columns}
        query={query}
        onQueryChange={setQuery}
        rowKey={(r) => r.id}
        onRowClick={live && canWrite ? openEdit : undefined}
        emptyTitle="No contacts match this filter"
        emptyDescription={
          live
            ? "Adjust the filters, or add your first customer or supplier."
            : "Adjust the filters, or connect a database to add real contacts."
        }
        bulkActions={() => (
          <Button variant="secondary" size="sm">
            <Download />
            Export
          </Button>
        )}
      />

      {live ? (
        <PartnerForm
          open={formOpen}
          onOpenChange={setFormOpen}
          partner={editing}
          defaultCountry={session.country}
          onSaved={handleSaved}
        />
      ) : null}
    </>
  );
}
