import { searchParamsToQuery, runQuery } from "@/lib/query/record-query";
import type { RecordPage } from "@/lib/query/record-query";
import { getContext } from "@/server/context";
import { listSalesOrders, type SalesOrderListItemDTO } from "@/server/sales/orders";
import { SALES_ORDERS } from "@/lib/mock/sales-orders";
import { SalesOrdersView } from "./sales-orders-view";

export const metadata = { title: "Sales Orders" };

/**
 * A SERVER component, closing the Stage 2 gap where this list ran entirely
 * client-side against mock data (src/lib/mock/sales-orders.ts). The query
 * runs in Postgres through the DAL; only a page of DTOs crosses to the
 * client, same shape as the inventory and contacts lists.
 */
export default async function SalesOrdersPage({ searchParams }: PageProps<"/app/sales">) {
  const params = await searchParams;
  const sp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string") sp.set(key, value);
    else if (Array.isArray(value) && value[0]) sp.set(key, value[0]);
  }

  const query = searchParamsToQuery(sp);
  const ctx = await getContext();

  let page: RecordPage<SalesOrderListItemDTO>;
  let live = false;

  if (ctx) {
    page = await listSalesOrders(ctx, query);
    live = true;
  } else {
    page = runQuery(
      SALES_ORDERS.map((o) => ({
        id: o.id,
        number: o.number,
        status: o.status,
        partnerName: o.customer,
        orderDate: o.orderDate,
        salespersonName: o.salesperson,
        warehouseName: o.warehouse,
        qtyOrdered: o.qtyOrdered,
        qtyDelivered: o.qtyDelivered,
        qtyInvoiced: o.qtyInvoiced,
        total: o.total,
      })) as unknown as (SalesOrderListItemDTO & Record<string, unknown>)[],
      query,
      ["number", "partnerName", "salespersonName"]
    );
  }

  return <SalesOrdersView page={page} query={query} live={live} />;
}
