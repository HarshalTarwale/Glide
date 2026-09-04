import { searchParamsToQuery } from "@/lib/query/record-query";
import type { RecordPage } from "@/lib/query/record-query";
import { requireContext } from "@/server/context";
import { listLeads, type LeadDTO } from "@/server/crm/leads";
import { LeadsView } from "./leads-view";

export const metadata = { title: "Leads" };

export default async function LeadsPage({ searchParams }: PageProps<"/app/crm/leads">) {
  const params = await searchParams;
  const sp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string") sp.set(key, value);
    else if (Array.isArray(value) && value[0]) sp.set(key, value[0]);
  }

  const query = searchParamsToQuery(sp);
  const ctx = await requireContext();
  const page: RecordPage<LeadDTO> = await listLeads(ctx, query);

  return <LeadsView page={page} query={query} />;
}
