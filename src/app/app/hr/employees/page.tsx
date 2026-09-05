import { searchParamsToQuery } from "@/lib/query/record-query";
import type { RecordPage } from "@/lib/query/record-query";
import { requireContext } from "@/server/context";
import { listEmployees, type EmployeeDTO } from "@/server/hr/employees";
import { EmployeesView } from "./employees-view";

export const metadata = { title: "Employees" };

export default async function EmployeesPage({ searchParams }: PageProps<"/app/hr/employees">) {
  const params = await searchParams;
  const sp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string") sp.set(key, value);
    else if (Array.isArray(value) && value[0]) sp.set(key, value[0]);
  }

  const query = searchParamsToQuery(sp);
  const ctx = await requireContext();
  const page: RecordPage<EmployeeDTO> = await listEmployees(ctx, query);

  return <EmployeesView page={page} query={query} />;
}
