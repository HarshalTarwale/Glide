import { searchParamsToQuery, runQuery } from "@/lib/query/record-query";
import type { RecordPage } from "@/lib/query/record-query";
import { getContext } from "@/server/context";
import { listInvoices, type InvoiceListItemDTO } from "@/server/invoicing/invoices";
import { DEMO_INVOICES } from "@/lib/mock/invoices";
import { InvoicesView } from "./invoices-view";

export const metadata = { title: "Invoices" };

/**
 * A SERVER component, same shape as /app/sales's list page: the query runs
 * in Postgres through the DAL, and a signed-out visitor sees the in-memory
 * demo dataset evaluated by the client-side twin of the same RecordQuery.
 */
export default async function InvoicesPage({ searchParams }: PageProps<"/app/invoices">) {
  const params = await searchParams;
  const sp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string") sp.set(key, value);
    else if (Array.isArray(value) && value[0]) sp.set(key, value[0]);
  }

  const query = searchParamsToQuery(sp);
  const ctx = await getContext();

  let page: RecordPage<InvoiceListItemDTO>;
  let live = false;

  if (ctx) {
    page = await listInvoices(ctx, query);
    live = true;
  } else {
    page = runQuery(
      DEMO_INVOICES as unknown as (InvoiceListItemDTO & Record<string, unknown>)[],
      query,
      ["number", "partnerName"]
    );
  }

  return <InvoicesView page={page} query={query} live={live} />;
}
