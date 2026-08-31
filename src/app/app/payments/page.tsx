import { searchParamsToQuery, runQuery } from "@/lib/query/record-query";
import type { RecordPage } from "@/lib/query/record-query";
import { getContext } from "@/server/context";
import { listPayments, type PaymentListItemDTO } from "@/server/invoicing/payments";
import { DEMO_PAYMENTS } from "@/lib/mock/payments";
import { PaymentsView } from "./payments-view";

export const metadata = { title: "Payments" };

export default async function PaymentsPage({ searchParams }: PageProps<"/app/payments">) {
  const params = await searchParams;
  const sp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string") sp.set(key, value);
    else if (Array.isArray(value) && value[0]) sp.set(key, value[0]);
  }

  const query = searchParamsToQuery(sp);
  const ctx = await getContext();

  let page: RecordPage<PaymentListItemDTO>;
  let live = false;

  if (ctx) {
    page = await listPayments(ctx, query);
    live = true;
  } else {
    page = runQuery(
      DEMO_PAYMENTS as unknown as (PaymentListItemDTO & Record<string, unknown>)[],
      query,
      ["number", "partnerName"]
    );
  }

  return <PaymentsView page={page} query={query} live={live} />;
}
