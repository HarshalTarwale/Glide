import { requireContext } from "@/server/context";
import { listLeaveTypes } from "@/server/hr/leave-types";
import { LeaveTypesView } from "./leave-types-view";

export const metadata = { title: "Leave Types" };

export default async function LeaveTypesPage() {
  const ctx = await requireContext();
  const leaveTypes = await listLeaveTypes(ctx);
  return <LeaveTypesView leaveTypes={leaveTypes} />;
}
