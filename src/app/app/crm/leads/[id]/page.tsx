import { notFound } from "next/navigation";
import { getContext } from "@/server/context";
import { getLead } from "@/server/crm/leads";
import { listActivitiesFor } from "@/server/crm/activities";
import { getAuditTrail } from "@/server/core/audit";
import { LeadView } from "./lead-view";

export default async function LeadPage({ params }: PageProps<"/app/crm/leads/[id]">) {
  const { id } = await params;
  const ctx = await getContext();
  if (!ctx) notFound();

  const lead = await getLead(ctx, id);
  if (!lead) notFound();

  const [activities, audit] = await Promise.all([
    listActivitiesFor(ctx, { leadId: lead.id }),
    getAuditTrail(ctx, "Lead", lead.id),
  ]);

  return <LeadView lead={lead} activities={activities} audit={audit} />;
}
