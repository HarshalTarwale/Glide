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
import type { PaymentListItemDTO } from "@/server/invoicing/payments";

const METHOD_LABEL: Record<string, string> = {
  bank_transfer: "Bank transfer",
  card: "Card",
  cash: "Cash",
  cheque: "Cheque",
  other: "Other",
};

export function PaymentsView({
  page,
  query,
  live,
}: {
  page: RecordPage<PaymentListItemDTO>;
  query: RecordQuery;
  live: boolean;
}) {
  const router = useRouter();

  const setQuery = React.useCallback(
    (next: RecordQuery) => {
      const sp = queryToSearchParams(next);
      router.push(sp.size ? `/app/payments?${sp}` : "/app/payments", { scroll: false });
    },
    [router]
  );

  const columns: Column<PaymentListItemDTO>[] = [
    { id: "number", header: "Number", sortField: "number", width: "150px", cell: (r) => <Code className="font-medium text-ink">{r.number}</Code> },
    { id: "customer", header: "Customer", sortField: "partner.name", cell: (r) => <span className="font-medium">{r.partnerName}</span> },
    { id: "paymentDate", header: "Date", sortField: "paymentDate", cell: (r) => <DateText value={r.paymentDate} className="text-ink-muted" /> },
    { id: "method", header: "Method", optional: true, cell: (r) => <span className="text-ink-muted">{METHOD_LABEL[r.method] ?? r.method}</span> },
    { id: "amount", header: "Amount", sortField: "amount", align: "right", cell: (r) => <Money value={r.amount} currency={r.currency} className="font-medium" /> },
    {
      id: "unallocated",
      header: "Unallocated",
      align: "right",
      cell: (r) =>
        r.unallocatedAmount > 0 ? (
          <Badge tone="warning" dot>
            <Money value={r.unallocatedAmount} currency={r.currency} />
          </Badge>
        ) : (
          <Badge tone="success" dot>
            Fully applied
          </Badge>
        ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Payments"
        crumbs={[{ label: "Finance" }, { label: "Payments" }]}
        meta={live ? undefined : "Demo payments — connect a database to record real payments."}
        actions={
          <PermissionGate permission="invoicing:payment:write">
            {live ? (
              <Button variant="primary" size="md" asChild>
                <Link href="/app/payments/new">
                  <Plus />
                  Record payment
                </Link>
              </Button>
            ) : (
              <Button variant="primary" size="md" disabled>
                <Plus />
                Record payment
              </Button>
            )}
          </PermissionGate>
        }
      />

      <FilterBar query={query} onQueryChange={setQuery} searchPlaceholder="Search payments, customers..." />

      <DataTable
        data={page}
        columns={columns}
        query={query}
        onQueryChange={setQuery}
        rowKey={(r) => r.id}
        onRowClick={live ? (r) => router.push(`/app/payments/${r.id}`) : undefined}
        emptyTitle="No payments match this filter"
        emptyDescription={live ? "Try clearing a filter, or record the first payment." : "Connect a database to record real payments."}
      />
    </>
  );
}
