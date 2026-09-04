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
import type { OpenBillDTO } from "@/server/procurement/bill-payments";
import { allocateBillPaymentAction } from "../../actions";

/**
 * Spreads a bill payment's unallocated remainder across any of the
 * supplier's open bills -- the buy-side mirror of invoicing's own
 * allocate-dialog.tsx.
 */
export function AllocateDialog({
  open,
  onOpenChange,
  paymentId,
  openBills,
  unallocatedAmount,
  currency,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  paymentId: string;
  openBills: OpenBillDTO[];
  unallocatedAmount: number;
  currency: string;
  onSaved: () => void;
}) {
  const [amounts, setAmounts] = React.useState<Record<string, number>>({});
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const allocations = openBills
    .map((b) => ({ billId: b.id, amount: amounts[b.id] ?? 0 }))
    .filter((a) => a.amount > 0);
  const totalAllocated = allocations.reduce((s, a) => s + a.amount, 0);
  const overAllocated = totalAllocated > unallocatedAmount;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const result = await allocateBillPaymentAction(paymentId, allocations);
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
            <Code>{unallocatedAmount.toFixed(2)} {currency}</Code> unallocated. Apply it across any of this supplier&apos;s open bills.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <DialogBody className="space-y-3">
            {openBills.length === 0 ? (
              <p className="text-sm text-ink-muted">This supplier has no other open bills to apply it to.</p>
            ) : (
              openBills.map((b) => (
                <div key={b.id} className="flex items-center justify-between gap-3 rounded-md border border-hairline px-3 py-2.5">
                  <div className="min-w-0">
                    <Code className="text-sm font-medium text-ink">{b.number}</Code>
                    <div className="text-2xs text-ink-subtle">Outstanding: {b.outstanding.toFixed(2)} {currency}</div>
                  </div>
                  <Input
                    type="number"
                    min="0"
                    max={b.outstanding}
                    step="0.01"
                    value={amounts[b.id] ?? 0}
                    onChange={(e) => setAmounts((a) => ({ ...a, [b.id]: Number(e.target.value) || 0 }))}
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
