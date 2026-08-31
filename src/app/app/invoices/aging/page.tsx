import { notFound } from "next/navigation";
import { getContext } from "@/server/context";
import { getArAgingReport } from "@/server/invoicing/ar-aging";
import { AgingView } from "./aging-view";

export const metadata = { title: "AR Aging" };

export default async function AgingPage() {
  const ctx = await getContext();
  if (!ctx) notFound();

  const report = await getArAgingReport(ctx);

  return <AgingView report={report} />;
}
