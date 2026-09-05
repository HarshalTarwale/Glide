import { requireContext } from "@/server/context";
import { getHrFormOptions } from "@/server/hr/options";
import { NewEmployeeForm } from "./new-employee-form";

export const metadata = { title: "New employee" };

export default async function NewEmployeePage() {
  const ctx = await requireContext();
  const options = await getHrFormOptions(ctx);
  return <NewEmployeeForm departments={options.departments} employees={options.employees} />;
}
