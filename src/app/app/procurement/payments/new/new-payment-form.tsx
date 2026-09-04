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
import type { OpenBillDTO } from "@/server/procurement/bill-payments";
import { recordBillPaymentAction, getOpenBillsForPartnerAction, type ActionResult } from "../../actions";

/**
 * The standalone payment-recording flow: pick a supplier, see every open
 * bill they have, and spread the payment across as many of them as the
 * amount covers -- the buy-side mirror of invoicing's own multi-invoice
 * payment flow.
 */
export function NewPaymentForm({ suppliers }: { suppliers: { id: string; name: string; currency: string | null }[] }) {
  const router = useRouter();
  const [partnerId, setPartnerId] = React.useState("");
  const [openBills, setOpenBills] = React.useState<OpenBillDTO[]>([]);
  const [dataPartnerId, setDataPartnerId] = React.useState("");
  const [allocations, setAllocations] = React.useState<Record<string, number>>({});
  const [amount, setAmount] = React.useState(0);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const supplier = suppliers.find((s) => s.id === partnerId);
  const loadingBills = partnerId !== "" && partnerId !== dataPartnerId;

  React.useEffect(() => {
    if (!partnerId) return;
    let cancelled = false;
    getOpenBillsForPartnerAction(partnerId).then((bills) => {
      if (cancelled) return;
      setOpenBills(bills);
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
    const allocationPayload = openBills.map((b) => ({ billId: b.id, amount: allocations[b.id] ?? 0 })).filter((a) => a.amount > 0);
    formData.set("allocations", JSON.stringify(allocationPayload));

    const result: ActionResult = await recordBillPaymentAction({ ok: false }, formData);
    setPending(false);
    if (result.ok && result.id) {
      toast.success("Payment recorded");
      router.push(`/app/procurement/payments/${result.id}`);
    } else {
      setError(result.error ?? "Could not record the payment");
    }
  }

  return (
    <>
      <PageHeader title="Record supplier payment" crumbs={[{ label: "Procurement", href: "/app/procurement/payments" }, { label: "Payments", href: "/app/procurement/payments" }, { label: "Record payment" }]} />

      <form onSubmit={handleSubmit} className="flex-1 overflow-auto px-6 py-5">
        <FormSection title="Payment details" className="pt-0">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="partnerId" required>
                Supplier
              </Label>
              <Select id="partnerId" name="partnerId" required value={partnerId} onChange={(e) => setPartnerId(e.target.value)}>
                <option value="">Select a supplier...</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
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

        <FormSection title="Apply to bills">
          {!partnerId ? (
            <p className="text-sm text-ink-subtle">Choose a supplier to see their open bills.</p>
          ) : loadingBills ? (
            <p className="text-sm text-ink-subtle">Loading open bills...</p>
          ) : openBills.length === 0 ? (
            <p className="text-sm text-ink-subtle">{supplier?.name} has no open bills. The payment will be recorded unallocated.</p>
          ) : (
            <div className="space-y-2">
              {openBills.map((b) => (
                <div key={b.id} className="flex items-center justify-between gap-3 rounded-md border border-hairline px-3 py-2.5">
                  <div className="min-w-0">
                    <Code className="text-sm font-medium text-ink">{b.number}</Code>
                    <div className="text-2xs text-ink-subtle">Outstanding: {b.outstanding.toFixed(2)}</div>
                  </div>
                  <Input
                    type="number"
                    min="0"
                    max={b.outstanding}
                    step="0.01"
                    value={allocations[b.id] ?? 0}
                    onChange={(e) => setAllocations((a) => ({ ...a, [b.id]: Number(e.target.value) || 0 }))}
                    className="h-8 w-28 text-right text-xs tnum"
                  />
                </div>
              ))}
              {overAllocated ? <p className="text-2xs text-danger">Allocated total exceeds the payment amount.</p> : null}
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
