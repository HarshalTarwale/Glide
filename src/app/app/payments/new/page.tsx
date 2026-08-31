import Link from "next/link";
import { UserPlus } from "lucide-react";
import { requireContext } from "@/server/context";
import { getInvoiceFormOptions } from "@/server/invoicing/options";
import { EmptyState } from "@/components/erp/empty-state";
import { PageHeader } from "@/components/erp/page-header";
import { Button } from "@/components/ui/button";
import { NewPaymentForm } from "./new-payment-form";

export const metadata = { title: "Record payment" };

export default async function NewPaymentPage() {
  const ctx = await requireContext();
  const options = await getInvoiceFormOptions(ctx);

  if (options.customers.length === 0) {
    return (
      <>
        <PageHeader title="Record payment" crumbs={[{ label: "Finance", href: "/app/payments" }, { label: "Payments", href: "/app/payments" }, { label: "Record payment" }]} />
        <EmptyState
          icon={UserPlus}
          title="No customers yet"
          description="Add a customer before recording a payment."
          action={
            <Button asChild variant="primary" size="md">
              <Link href="/app/contacts">Add a customer</Link>
            </Button>
          }
        />
      </>
    );
  }

  return <NewPaymentForm customers={options.customers} />;
}
