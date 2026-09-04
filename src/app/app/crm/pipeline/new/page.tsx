import Link from "next/link";
import { UserPlus } from "lucide-react";
import { requireContext } from "@/server/context";
import { getCrmFormOptions } from "@/server/crm/options";
import { EmptyState } from "@/components/erp/empty-state";
import { PageHeader } from "@/components/erp/page-header";
import { Button } from "@/components/ui/button";
import { NewOpportunityForm } from "./new-opportunity-form";

export const metadata = { title: "New opportunity" };

export default async function NewOpportunityPage() {
  const ctx = await requireContext();
  const options = await getCrmFormOptions(ctx);

  if (options.partners.length === 0) {
    return (
      <>
        <PageHeader title="New opportunity" crumbs={[{ label: "CRM" }, { label: "Pipeline", href: "/app/crm/pipeline" }, { label: "New opportunity" }]} />
        <EmptyState
          icon={UserPlus}
          title="No contacts yet"
          description="Add a contact (or convert a lead) before creating an opportunity."
          action={
            <Button asChild variant="primary" size="md">
              <Link href="/app/contacts">Add a contact</Link>
            </Button>
          }
        />
      </>
    );
  }

  return <NewOpportunityForm options={options} />;
}
