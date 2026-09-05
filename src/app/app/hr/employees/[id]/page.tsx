import { notFound } from "next/navigation";
import { getContext } from "@/server/context";
import { getEmployee } from "@/server/hr/employees";
import { listLeaveRequestsForEmployee, getLeaveBalances } from "@/server/hr/leave-requests";
import { getHrFormOptions } from "@/server/hr/options";
import { getAuditTrail } from "@/server/core/audit";
import { EmployeeView } from "./employee-view";

export default async function EmployeePage({ params }: PageProps<"/app/hr/employees/[id]">) {
  const { id } = await params;
  const ctx = await getContext();
  if (!ctx) notFound();

  const employee = await getEmployee(ctx, id);
  if (!employee) notFound();

  const [leaveRequests, balances, options, audit] = await Promise.all([
    listLeaveRequestsForEmployee(ctx, id),
    getLeaveBalances(ctx, id),
    getHrFormOptions(ctx),
    getAuditTrail(ctx, "Employee", id),
  ]);

  return <EmployeeView employee={employee} leaveRequests={leaveRequests} balances={balances} leaveTypes={options.leaveTypes} audit={audit} />;
}
