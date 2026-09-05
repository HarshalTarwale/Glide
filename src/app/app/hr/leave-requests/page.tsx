import { searchParamsToQuery } from "@/lib/query/record-query";
import type { RecordPage } from "@/lib/query/record-query";
import { requireContext } from "@/server/context";
import { listLeaveRequests, type LeaveRequestDTO } from "@/server/hr/leave-requests";
import { LeaveRequestsView } from "./leave-requests-view";

export const metadata = { title: "Leave Requests" };

export default async function LeaveRequestsPage({ searchParams }: PageProps<"/app/hr/leave-requests">) {
  const params = await searchParams;
  const sp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string") sp.set(key, value);
    else if (Array.isArray(value) && value[0]) sp.set(key, value[0]);
  }

  const query = searchParamsToQuery(sp);
  const ctx = await requireContext();
  const page: RecordPage<LeaveRequestDTO> = await listLeaveRequests(ctx, query);

  return <LeaveRequestsView page={page} query={query} />;
}
