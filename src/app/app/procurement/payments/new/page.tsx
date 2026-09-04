import { requireContext } from "@/server/context";
import { getProcurementFormOptions } from "@/server/procurement/options";
import { NewPaymentForm } from "./new-payment-form";

export const metadata = { title: "Record supplier payment" };

export default async function NewBillPaymentPage() {
  const ctx = await requireContext();
  const options = await getProcurementFormOptions(ctx);
  return <NewPaymentForm suppliers={options.suppliers} />;
}
