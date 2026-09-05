import { searchParamsToQuery } from "@/lib/query/record-query";
import type { RecordPage } from "@/lib/query/record-query";
import { requireContext } from "@/server/context";
import { listWorkOrders, type WorkOrderDTO } from "@/server/manufacturing/work-orders";
import { WorkOrdersView } from "./work-orders-view";

export const metadata = { title: "Work Orders" };

export default async function WorkOrdersPage({ searchParams }: PageProps<"/app/manufacturing/work-orders">) {
  const params = await searchParams;
  const sp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string") sp.set(key, value);
    else if (Array.isArray(value) && value[0]) sp.set(key, value[0]);
  }

  const query = searchParamsToQuery(sp);
  const ctx = await requireContext();
  const page: RecordPage<WorkOrderDTO> = await listWorkOrders(ctx, query);

  return <WorkOrdersView page={page} query={query} />;
}
