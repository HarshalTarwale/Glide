import { requireContext } from "@/server/context";
import { NewLeadForm } from "./new-lead-form";

export const metadata = { title: "New lead" };

export default async function NewLeadPage() {
  await requireContext();
  return <NewLeadForm />;
}
