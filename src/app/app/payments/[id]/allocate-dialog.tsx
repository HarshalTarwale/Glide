"use client";

import * as React from "react";
import { AlertCircle } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogBody,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Code } from "@/components/erp/money";
import type { OpenInvoiceDTO } from "@/server/invoicing/invoices";
import { allocatePaymentAction } from "../../invoices/actions";

/**
 * Spreads a payment's unallocated remainder across any of the partner's
 * open invoices -- the direct UI for the roadmap's own acceptance line,
 * "one payment can settle parts of three invoices," for a payment that
 * arrived without every allocation decided up front.
 */
export function AllocateDialog({
  open,
  onOpenChange,
  paymentId,
  openInvoices,
  unallocatedAmount,
  currency,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  paymentId: string;
  openInvoices: OpenInvoiceDTO[];
  unallocatedAmount: number;
  currency: string;
  onSaved: () => void;
}) {
  const [amounts, setAmounts] = React.useState<Record<string, number>>({});
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const allocations = openInvoices
    .map((inv) => ({ invoiceId: inv.id, amount: amounts[inv.id] ?? 0 }))
    .filter((a) => a.amount > 0);
  const totalAllocated = allocations.reduce((s, a) => s + a.amount, 0);
  const overAllocated = totalAllocated > unallocatedAmount;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const result = await allocatePaymentAction(paymentId, allocations);
    setPending(false);
    if (result.ok) {
      onOpenChange(false);
      setAmounts({});
      onSaved();
    } else {
      setError(result.error ?? "Could not allocate the payment");
      toast.error(result.error ?? "Could not allocate the payment");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Allocate payment</DialogTitle>
          <DialogDescription>
            <Code>{unallocatedAmount.toFixed(2)} {currency}</Code> unallocated. Apply it across any of this customer&apos;s open invoices.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <DialogBody className="space-y-3">
            {openInvoices.length === 0 ? (
              <p className="text-sm text-ink-muted">This customer has no other open invoices to apply it to.</p>
            ) : (
              openInvoices.map((inv) => (
                <div key={inv.id} className="flex items-center justify-between gap-3 rounded-md border border-hairline px-3 py-2.5">
                  <div className="min-w-0">
                    <Code className="text-sm font-medium text-ink">{inv.number}</Code>
                    <div className="text-2xs text-ink-subtle">Outstanding: {inv.outstanding.toFixed(2)} {currency}</div>
                  </div>
                  <Input
                    type="number"
                    min="0"
                    max={inv.outstanding}
                    step="0.01"
                    value={amounts[inv.id] ?? 0}
                    onChange={(e) => setAmounts((a) => ({ ...a, [inv.id]: Number(e.target.value) || 0 }))}
                    className="h-8 w-28 text-right text-xs tnum"
                  />
                </div>
              ))
            )}

            {overAllocated ? (
              <div role="alert" className="flex items-start gap-2 rounded-md border border-danger/20 bg-danger-soft px-3 py-2 text-xs text-danger">
                <AlertCircle className="mt-px size-3.5 shrink-0" />
                <span>That&apos;s more than the {unallocatedAmount.toFixed(2)} {currency} still unallocated.</span>
              </div>
            ) : null}

            {error ? (
              <div role="alert" className="flex items-start gap-2 rounded-md border border-danger/20 bg-danger-soft px-3 py-2 text-xs text-danger">
                <AlertCircle className="mt-px size-3.5 shrink-0" />
                <span>{error}</span>
              </div>
            ) : null}
          </DialogBody>

          <DialogFooter>
            <Button type="button" variant="ghost" size="md" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" size="md" disabled={pending || allocations.length === 0 || overAllocated}>
              {pending ? "Allocating..." : "Allocate"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
