import { searchParamsToQuery } from "@/lib/query/record-query";
import type { RecordPage } from "@/lib/query/record-query";
import { requireContext } from "@/server/context";
import { listBillPayments, type BillPaymentListItemDTO } from "@/server/procurement/bill-payments";
import { PaymentsView } from "./payments-view";

export const metadata = { title: "Supplier Payments" };

export default async function BillPaymentsPage({ searchParams }: PageProps<"/app/procurement/payments">) {
  const params = await searchParams;
  const sp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string") sp.set(key, value);
    else if (Array.isArray(value) && value[0]) sp.set(key, value[0]);
  }

  const query = searchParamsToQuery(sp);
  const ctx = await requireContext();
  const page: RecordPage<BillPaymentListItemDTO> = await listBillPayments(ctx, query);

  return <PaymentsView page={page} query={query} />;
}
