import { notFound } from "next/navigation";
import { getContext } from "@/server/context";
import { getSalesOrder } from "@/server/sales/orders";
import { getAuditTrail } from "@/server/core/audit";
import { SalesOrderView } from "./sales-order-view";

export default async function SalesOrderPage({ params }: PageProps<"/app/sales/[id]">) {
  const { id } = await params;
  const ctx = await getContext();
  if (!ctx) notFound();

  const order = await getSalesOrder(ctx, id);
  if (!order) notFound();

  const audit = await getAuditTrail(ctx, "SalesOrder", order.id);

  return <SalesOrderView order={order} audit={audit} />;
}
