"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/erp/page-header";
import { FilterBar } from "@/components/erp/filter-bar";
import { DataTable, type Column } from "@/components/erp/data-table";
import { Money, DateText, Code } from "@/components/erp/money";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PermissionGate } from "@/components/layout/session-context";
import { queryToSearchParams, type RecordPage, type RecordQuery } from "@/lib/query/record-query";
import type { BillPaymentListItemDTO } from "@/server/procurement/bill-payments";

const METHOD_LABEL: Record<string, string> = {
  bank_transfer: "Bank transfer",
  card: "Card",
  cash: "Cash",
  cheque: "Cheque",
  other: "Other",
};

export function PaymentsView({ page, query }: { page: RecordPage<BillPaymentListItemDTO>; query: RecordQuery }) {
  const router = useRouter();

  const setQuery = React.useCallback(
    (next: RecordQuery) => {
      const sp = queryToSearchParams(next);
      router.push(sp.size ? `/app/procurement/payments?${sp}` : "/app/procurement/payments", { scroll: false });
    },
    [router]
  );

  const columns: Column<BillPaymentListItemDTO>[] = [
    { id: "number", header: "Number", sortField: "number", width: "150px", cell: (r) => <Code className="font-medium text-ink">{r.number}</Code> },
    { id: "supplier", header: "Supplier", sortField: "partner.name", cell: (r) => <span className="font-medium">{r.partnerName}</span> },
    { id: "paymentDate", header: "Date", sortField: "paymentDate", cell: (r) => <DateText value={r.paymentDate} className="text-ink-muted" /> },
    { id: "method", header: "Method", optional: true, cell: (r) => <span className="text-ink-muted">{METHOD_LABEL[r.method] ?? r.method}</span> },
    { id: "amount", header: "Amount", sortField: "amount", align: "right", cell: (r) => <Money value={r.amount} currency={r.currency} className="font-medium" /> },
    {
      id: "unallocated",
      header: "Unallocated",
      align: "right",
      cell: (r) =>
        r.unallocatedAmount > 0 ? (
          <Badge tone="warning">
            <Money value={r.unallocatedAmount} currency={r.currency} />
          </Badge>
        ) : (
          <span className="text-ink-subtle">—</span>
        ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Supplier Payments"
        crumbs={[{ label: "Procurement" }, { label: "Payments" }]}
        actions={
          <PermissionGate permission="procurement:payment:write">
            <Button variant="primary" size="md" asChild>
              <Link href="/app/procurement/payments/new">
                <Plus />
                Record payment
              </Link>
            </Button>
          </PermissionGate>
        }
      />

      <FilterBar query={query} onQueryChange={setQuery} searchPlaceholder="Search payments, suppliers..." />

      <DataTable
        data={page}
        columns={columns}
        query={query}
        onQueryChange={setQuery}
        rowKey={(r) => r.id}
        onRowClick={(r) => router.push(`/app/procurement/payments/${r.id}`)}
        emptyTitle="No payments match this filter"
        emptyDescription="Try clearing a filter, or record the first payment."
      />
    </>
  );
}
