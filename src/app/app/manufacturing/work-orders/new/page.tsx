import { requireContext } from "@/server/context";
import { getManufacturingFormOptions } from "@/server/manufacturing/options";
import { NewWorkOrderForm } from "./new-work-order-form";

export const metadata = { title: "New work order" };

export default async function NewWorkOrderPage() {
  const ctx = await requireContext();
  const options = await getManufacturingFormOptions(ctx);
  return <NewWorkOrderForm boms={options.boms} warehouses={options.warehouses} />;
}
