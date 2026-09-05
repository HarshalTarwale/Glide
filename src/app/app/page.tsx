import { requireContext } from "@/server/context";
import { getDashboardSummary } from "@/server/reporting/dashboard";
import { OverviewView } from "./overview-view";

export default async function OverviewPage() {
  const ctx = await requireContext();
  const summary = await getDashboardSummary(ctx);
  return <OverviewView summary={summary} />;
}
