import { notFound } from "next/navigation";
import { getContext } from "@/server/context";
import { getPurchaseOrder } from "@/server/procurement/orders";
import { getBillableOrderLines } from "@/server/procurement/options";
import { getAuditTrail } from "@/server/core/audit";
import { OrderView } from "./order-view";

export default async function PurchaseOrderPage({ params }: PageProps<"/app/procurement/orders/[id]">) {
  const { id } = await params;
  const ctx = await getContext();
  if (!ctx) notFound();

  const order = await getPurchaseOrder(ctx, id);
  if (!order) notFound();

  const [audit, billableLines] = await Promise.all([
    getAuditTrail(ctx, "PurchaseOrder", order.id),
    getBillableOrderLines(ctx, order.id),
  ]);

  return <OrderView order={order} audit={audit} billableLines={billableLines} />;
}
