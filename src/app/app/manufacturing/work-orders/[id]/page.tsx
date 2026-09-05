import { notFound } from "next/navigation";
import { getContext } from "@/server/context";
import { getWorkOrder } from "@/server/manufacturing/work-orders";
import { getAuditTrail } from "@/server/core/audit";
import { WorkOrderView } from "./work-order-view";

export default async function WorkOrderPage({ params }: PageProps<"/app/manufacturing/work-orders/[id]">) {
  const { id } = await params;
  const ctx = await getContext();
  if (!ctx) notFound();

  const workOrder = await getWorkOrder(ctx, id);
  if (!workOrder) notFound();

  const audit = await getAuditTrail(ctx, "WorkOrder", id);

  return <WorkOrderView workOrder={workOrder} audit={audit} />;
}
