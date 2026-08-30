import Link from "next/link";
import { UserPlus } from "lucide-react";
import { requireContext } from "@/server/context";
import { getSalesFormOptions } from "@/server/sales/options";
import { EmptyState } from "@/components/erp/empty-state";
import { PageHeader } from "@/components/erp/page-header";
import { Button } from "@/components/ui/button";
import { NewOrderForm } from "./new-order-form";

export const metadata = { title: "New sales order" };

export default async function NewSalesOrderPage() {
  const ctx = await requireContext();
  const options = await getSalesFormOptions(ctx);

  if (options.customers.length === 0) {
    return (
      <>
        <PageHeader title="New sales order" crumbs={[{ label: "Sales", href: "/app/sales" }, { label: "New order" }]} />
        <EmptyState
          icon={UserPlus}
          title="No customers yet"
          description="Add a customer before creating a sales order."
          action={
            <Button asChild variant="primary" size="md">
              <Link href="/app/contacts">Add a customer</Link>
            </Button>
          }
        />
      </>
    );
  }

  return <NewOrderForm options={options} />;
}
