import { requireContext } from "@/server/context";
import { getBusinessInsights } from "@/server/reporting/insights";
import { InsightsView } from "./insights-view";

export const metadata = { title: "Business Insights" };

export default async function InsightsPage() {
  const ctx = await requireContext();
  const insights = await getBusinessInsights(ctx);
  return <InsightsView insights={insights} />;
}
