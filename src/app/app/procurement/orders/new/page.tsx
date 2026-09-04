import Link from "next/link";
import { UserPlus } from "lucide-react";
import { requireContext } from "@/server/context";
import { getProcurementFormOptions } from "@/server/procurement/options";
import { EmptyState } from "@/components/erp/empty-state";
import { PageHeader } from "@/components/erp/page-header";
import { Button } from "@/components/ui/button";
import { NewOrderForm } from "./new-order-form";

export const metadata = { title: "New purchase order" };

export default async function NewPurchaseOrderPage() {
  const ctx = await requireContext();
  const options = await getProcurementFormOptions(ctx);

  if (options.suppliers.length === 0) {
    return (
      <>
        <PageHeader title="New purchase order" crumbs={[{ label: "Procurement", href: "/app/procurement/orders" }, { label: "Orders", href: "/app/procurement/orders" }, { label: "New order" }]} />
        <EmptyState
          icon={UserPlus}
          title="No suppliers yet"
          description="Add a supplier before creating a purchase order."
          action={
            <Button asChild variant="primary" size="md">
              <Link href="/app/contacts">Add a supplier</Link>
            </Button>
          }
        />
      </>
    );
  }

  return <NewOrderForm options={options} />;
}
