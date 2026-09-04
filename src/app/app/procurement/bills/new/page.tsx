import Link from "next/link";
import { UserPlus } from "lucide-react";
import { requireContext } from "@/server/context";
import { getProcurementFormOptions } from "@/server/procurement/options";
import { EmptyState } from "@/components/erp/empty-state";
import { PageHeader } from "@/components/erp/page-header";
import { Button } from "@/components/ui/button";
import { NewBillForm } from "./new-bill-form";

export const metadata = { title: "New bill" };

export default async function NewBillPage() {
  const ctx = await requireContext();
  const options = await getProcurementFormOptions(ctx);

  if (options.suppliers.length === 0) {
    return (
      <>
        <PageHeader title="New bill" crumbs={[{ label: "Procurement", href: "/app/procurement/bills" }, { label: "Bills", href: "/app/procurement/bills" }, { label: "New bill" }]} />
        <EmptyState
          icon={UserPlus}
          title="No suppliers yet"
          description="Add a supplier before creating a bill."
          action={
            <Button asChild variant="primary" size="md">
              <Link href="/app/contacts">Add a supplier</Link>
            </Button>
          }
        />
      </>
    );
  }

  return <NewBillForm options={options} />;
}
