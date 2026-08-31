"use client";

import * as React from "react";
import { useActionState } from "react";
import { AlertCircle } from "lucide-react";
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
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Code } from "@/components/erp/money";
import { recordPaymentAction, type ActionResult } from "../actions";

/**
 * Records a payment against exactly one invoice -- the common case, reached
 * from that invoice's own record page. To settle several invoices at once
 * with a single payment (the P4 acceptance line: "one payment can settle
 * parts of three invoices"), use /app/payments/new, which lets a partner's
 * open invoices be picked freely rather than pre-filling one.
 */
export function RecordPaymentDialog({
  open,
  onOpenChange,
  partnerId,
  partnerName,
  preselectedInvoice,
  currency,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  partnerId: string;
  partnerName: string;
  preselectedInvoice: { id: string; number: string; outstanding: number };
  currency: string;
  onSaved: () => void;
}) {
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(recordPaymentAction, { ok: false });
  const [amount, setAmount] = React.useState(preselectedInvoice.outstanding);

  const prevOk = React.useRef(false);
  React.useEffect(() => {
    if (state.ok && !prevOk.current) {
      onOpenChange(false);
      onSaved();
    }
    prevOk.current = state.ok;
  }, [state.ok, onOpenChange, onSaved]);

  const allocations = amount > 0 ? [{ invoiceId: preselectedInvoice.id, amount: Math.min(amount, preselectedInvoice.outstanding) }] : [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Record a payment</DialogTitle>
          <DialogDescription>
            From {partnerName}, applied to {preselectedInvoice.number}.
          </DialogDescription>
        </DialogHeader>

        <form action={formAction}>
          <input type="hidden" name="partnerId" value={partnerId} />
          <input type="hidden" name="allocations" value={JSON.stringify(allocations)} />

          <DialogBody className="space-y-3">
            <div className="flex items-center justify-between gap-3 rounded-md border border-hairline px-3 py-2.5">
              <Code className="text-2xs text-ink-subtle">{preselectedInvoice.number}</Code>
              <span className="text-2xs text-ink-subtle">
                Outstanding: <Code className="text-ink">{preselectedInvoice.outstanding.toFixed(2)} {currency}</Code>
              </span>
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
              {state.fieldErrors?.amount ? <p className="text-2xs text-danger">{state.fieldErrors.amount}</p> : null}
            </div>

            <div className="grid grid-cols-2 gap-3">
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
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="reference">Reference</Label>
              <Input id="reference" name="reference" placeholder="Transaction ID, cheque number..." />
            </div>

            {state.error ? (
              <div role="alert" className="flex items-start gap-2 rounded-md border border-danger/20 bg-danger-soft px-3 py-2 text-xs text-danger">
                <AlertCircle className="mt-px size-3.5 shrink-0" />
                <span>{state.error}</span>
              </div>
            ) : null}
          </DialogBody>

          <DialogFooter>
            <Button type="button" variant="ghost" size="md" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" size="md" disabled={pending || amount <= 0}>
              {pending ? "Recording..." : "Record payment"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
