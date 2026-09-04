import { notFound } from "next/navigation";
import { getContext } from "@/server/context";
import { getOpportunity } from "@/server/crm/opportunities";
import { listActivitiesFor } from "@/server/crm/activities";
import { getAuditTrail } from "@/server/core/audit";
import { OpportunityView } from "./opportunity-view";

export default async function OpportunityPage({ params }: PageProps<"/app/crm/pipeline/[id]">) {
  const { id } = await params;
  const ctx = await getContext();
  if (!ctx) notFound();

  const opportunity = await getOpportunity(ctx, id);
  if (!opportunity) notFound();

  const [activities, audit] = await Promise.all([
    listActivitiesFor(ctx, { opportunityId: opportunity.id }),
    getAuditTrail(ctx, "Opportunity", opportunity.id),
  ]);

  return <OpportunityView opportunity={opportunity} activities={activities} audit={audit} />;
}
