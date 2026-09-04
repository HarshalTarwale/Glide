import { notFound } from "next/navigation";
import { getContext } from "@/server/context";
import { getApAgingReport } from "@/server/procurement/ap-aging";
import { AgingView } from "./aging-view";

export const metadata = { title: "AP Aging" };

export default async function ApAgingPage() {
  const ctx = await getContext();
  if (!ctx) notFound();

  const report = await getApAgingReport(ctx);

  return <AgingView report={report} />;
}
