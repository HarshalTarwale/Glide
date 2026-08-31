import Link from "next/link";
import { UserPlus } from "lucide-react";
import { requireContext } from "@/server/context";
import { getInvoiceFormOptions } from "@/server/invoicing/options";
import { EmptyState } from "@/components/erp/empty-state";
import { PageHeader } from "@/components/erp/page-header";
import { Button } from "@/components/ui/button";
import { NewInvoiceForm } from "./new-invoice-form";

export const metadata = { title: "New invoice" };

export default async function NewInvoicePage() {
  const ctx = await requireContext();
  const options = await getInvoiceFormOptions(ctx);

  if (options.customers.length === 0) {
    return (
      <>
        <PageHeader title="New invoice" crumbs={[{ label: "Finance", href: "/app/invoices" }, { label: "Invoices", href: "/app/invoices" }, { label: "New invoice" }]} />
        <EmptyState
          icon={UserPlus}
          title="No customers yet"
          description="Add a customer before creating an invoice."
          action={
            <Button asChild variant="primary" size="md">
              <Link href="/app/contacts">Add a customer</Link>
            </Button>
          }
        />
      </>
    );
  }

  return <NewInvoiceForm options={options} />;
}
