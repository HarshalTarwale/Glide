import { searchParamsToQuery } from "@/lib/query/record-query";
import type { RecordPage } from "@/lib/query/record-query";
import { requireContext } from "@/server/context";
import { listPurchaseOrders, type PurchaseOrderListItemDTO } from "@/server/procurement/orders";
import { PurchaseOrdersView } from "./orders-view";

export const metadata = { title: "Purchase Orders" };

export default async function PurchaseOrdersPage({ searchParams }: PageProps<"/app/procurement/orders">) {
  const params = await searchParams;
  const sp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string") sp.set(key, value);
    else if (Array.isArray(value) && value[0]) sp.set(key, value[0]);
  }

  const query = searchParamsToQuery(sp);
  const ctx = await requireContext();
  const page: RecordPage<PurchaseOrderListItemDTO> = await listPurchaseOrders(ctx, query);

  return <PurchaseOrdersView page={page} query={query} />;
}
