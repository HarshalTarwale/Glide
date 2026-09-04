import { notFound } from "next/navigation";
import { getContext } from "@/server/context";
import { getBill } from "@/server/procurement/bills";
import { getAuditTrail } from "@/server/core/audit";
import { BillView } from "./bill-view";

export default async function BillPage({ params }: PageProps<"/app/procurement/bills/[id]">) {
  const { id } = await params;
  const ctx = await getContext();
  if (!ctx) notFound();

  const bill = await getBill(ctx, id);
  if (!bill) notFound();

  const audit = await getAuditTrail(ctx, "Bill", bill.id);

  return <BillView bill={bill} audit={audit} />;
}
