import { requireContext } from "@/server/context";
import { getPipeline } from "@/server/crm/opportunities";
import { PipelineView } from "./pipeline-view";

export const metadata = { title: "Pipeline" };

export default async function PipelinePage() {
  const ctx = await requireContext();
  const { opportunities, summary } = await getPipeline(ctx);

  return <PipelineView opportunities={opportunities} summary={summary} />;
}
