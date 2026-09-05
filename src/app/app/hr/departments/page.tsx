import { requireContext } from "@/server/context";
import { listDepartments } from "@/server/hr/departments";
import { DepartmentsView } from "./departments-view";

export const metadata = { title: "Departments" };

export default async function DepartmentsPage() {
  const ctx = await requireContext();
  const departments = await listDepartments(ctx);
  return <DepartmentsView departments={departments} />;
}
