"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertCircle } from "lucide-react";
import { PageHeader } from "@/components/erp/page-header";
import { FormSection } from "@/components/erp/field-grid";
import { Input, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Code } from "@/components/erp/money";
import type { OpenInvoiceDTO } from "@/server/invoicing/invoices";
import { recordPaymentAction, getOpenInvoicesForPartnerAction, type ActionResult } from "../../invoices/actions";

/**
 * The standalone payment-recording flow: pick a customer, see every open
 * invoice they have, and spread the payment across as many of them as the
 * amount covers -- the direct UI for the roadmap's own acceptance line,
 * "one payment can settle parts of three invoices."
 */
export function NewPaymentForm({ customers }: { customers: { id: string; name: string; currency: string | null }[] }) {
  const router = useRouter();
  const [partnerId, setPartnerId] = React.useState("");
  const [openInvoices, setOpenInvoices] = React.useState<OpenInvoiceDTO[]>([]);
  // Which partner `openInvoices` actually belongs to -- comparing this to
  // `partnerId` derives "loading" during render instead of a setState call
  // inside the effect body (the React Compiler lint's "adjust state while
  // rendering" pattern), and doubles as the guard against a stale response
  // landing after the user has already switched customers again.
  const [dataPartnerId, setDataPartnerId] = React.useState("");
  const [allocations, setAllocations] = React.useState<Record<string, number>>({});
  const [amount, setAmount] = React.useState(0);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const customer = customers.find((c) => c.id === partnerId);
  const loadingInvoices = partnerId !== "" && partnerId !== dataPartnerId;

  React.useEffect(() => {
    if (!partnerId) return;
    let cancelled = false;
    getOpenInvoicesForPartnerAction(partnerId).then((invoices) => {
      if (cancelled) return;
      setOpenInvoices(invoices);
      setAllocations({});
      setDataPartnerId(partnerId);
    });
    return () => {
      cancelled = true;
    };
  }, [partnerId]);

  const totalAllocated = Object.values(allocations).reduce((s, v) => s + (v || 0), 0);
  const overAllocated = totalAllocated > amount;

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);

    const formData = new FormData(e.currentTarget);
    const allocationPayload = openInvoices
      .map((inv) => ({ invoiceId: inv.id, amount: allocations[inv.id] ?? 0 }))
      .filter((a) => a.amount > 0);
    formData.set("allocations", JSON.stringify(allocationPayload));

    const result: ActionResult = await recordPaymentAction({ ok: false }, formData);
    setPending(false);
    if (result.ok && result.id) {
      toast.success("Payment recorded");
      router.push(`/app/payments/${result.id}`);
    } else {
      setError(result.error ?? "Could not record the payment");
    }
  }

  return (
    <>
      <PageHeader title="Record payment" crumbs={[{ label: "Finance", href: "/app/payments" }, { label: "Payments", href: "/app/payments" }, { label: "Record payment" }]} />

      <form onSubmit={handleSubmit} className="flex-1 overflow-auto px-6 py-5">
        <FormSection title="Payment details" className="pt-0">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="partnerId" required>
                Customer
              </Label>
              <Select id="partnerId" name="partnerId" required value={partnerId} onChange={(e) => setPartnerId(e.target.value)}>
                <option value="">Select a customer...</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="amount" required>
                Amount
              </Label>
              <Input
                id="amount"
                name="amount"
                type="number"
                min="0.01"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(Number(e.target.value) || 0)}
                className="tnum"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="method">Method</Label>
              <Select id="method" name="method" defaultValue="bank_transfer">
                <option value="bank_transfer">Bank transfer</option>
                <option value="card">Card</option>
                <option value="cash">Cash</option>
                <option value="cheque">Cheque</option>
                <option value="other">Other</option>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="paymentDate">Date</Label>
              <Input id="paymentDate" name="paymentDate" type="date" />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="reference">Reference</Label>
              <Input id="reference" name="reference" placeholder="Transaction ID, cheque number..." />
            </div>
          </div>
        </FormSection>

        <FormSection title="Apply to invoices">
          {!partnerId ? (
            <p className="text-sm text-ink-subtle">Choose a customer to see their open invoices.</p>
          ) : loadingInvoices ? (
            <p className="text-sm text-ink-subtle">Loading open invoices...</p>
          ) : openInvoices.length === 0 ? (
            <p className="text-sm text-ink-subtle">{customer?.name} has no open invoices. The payment will be recorded unallocated.</p>
          ) : (
            <div className="space-y-2">
              {openInvoices.map((inv) => (
                <div key={inv.id} className="flex items-center justify-between gap-3 rounded-md border border-hairline px-3 py-2.5">
                  <div className="min-w-0">
                    <Code className="text-sm font-medium text-ink">{inv.number}</Code>
                    <div className="text-2xs text-ink-subtle">Outstanding: {inv.outstanding.toFixed(2)}</div>
                  </div>
                  <Input
                    type="number"
                    min="0"
                    max={inv.outstanding}
                    step="0.01"
                    value={allocations[inv.id] ?? 0}
                    onChange={(e) => setAllocations((a) => ({ ...a, [inv.id]: Number(e.target.value) || 0 }))}
                    className="h-8 w-28 text-right text-xs tnum"
                  />
                </div>
              ))}
              {overAllocated ? (
                <p className="text-2xs text-danger">Allocated total exceeds the payment amount.</p>
              ) : null}
            </div>
          )}
        </FormSection>

        <FormSection title="Notes" className="pb-0">
          <Textarea name="notes" placeholder="Optional" />
        </FormSection>

        {error ? (
          <div role="alert" className="mt-4 flex items-start gap-2 rounded-md border border-danger/20 bg-danger-soft px-3 py-2 text-xs text-danger">
            <AlertCircle className="mt-px size-3.5 shrink-0" />
            <span>{error}</span>
          </div>
        ) : null}

        <div className="mt-6 flex justify-end gap-2 border-t border-hairline pt-4">
          <Button type="submit" variant="primary" size="md" disabled={pending || !partnerId || amount <= 0 || overAllocated}>
            {pending ? "Recording..." : "Record payment"}
          </Button>
        </div>
      </form>
    </>
  );
}
