import { searchParamsToQuery } from "@/lib/query/record-query";
import type { RecordPage } from "@/lib/query/record-query";
import { requireContext } from "@/server/context";
import { listBills, type BillListItemDTO } from "@/server/procurement/bills";
import { BillsView } from "./bills-view";

export const metadata = { title: "Bills" };

export default async function BillsPage({ searchParams }: PageProps<"/app/procurement/bills">) {
  const params = await searchParams;
  const sp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string") sp.set(key, value);
    else if (Array.isArray(value) && value[0]) sp.set(key, value[0]);
  }

  const query = searchParamsToQuery(sp);
  const ctx = await requireContext();
  const page: RecordPage<BillListItemDTO> = await listBills(ctx, query);

  return <BillsView page={page} query={query} />;
}
