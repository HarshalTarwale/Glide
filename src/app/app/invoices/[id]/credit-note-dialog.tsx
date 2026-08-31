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
import { Input, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Code, Money } from "@/components/erp/money";
import type { InvoiceLineDTO } from "@/server/invoicing/invoices";
import { createCreditNoteAction, type ActionResult } from "../actions";

export function CreditNoteDialog({
  open,
  onOpenChange,
  invoiceId,
  lines,
  currency,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoiceId: string;
  lines: InvoiceLineDTO[];
  currency: string;
  onSaved: () => void;
}) {
  const action = createCreditNoteAction.bind(null, invoiceId);
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(action, { ok: false });
  const [quantities, setQuantities] = React.useState<Record<string, number>>({});

  const prevOk = React.useRef(false);
  React.useEffect(() => {
    if (state.ok && !prevOk.current) {
      onOpenChange(false);
      setQuantities({});
      onSaved();
    }
    prevOk.current = state.ok;
  }, [state.ok, onOpenChange, onSaved]);

  const payload = lines
    .map((l) => ({ invoiceLineId: l.id, quantity: quantities[l.id] ?? 0 }))
    .filter((l) => l.quantity > 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Issue a credit note</DialogTitle>
          <DialogDescription>
            The only way to correct a posted invoice — the invoice itself never changes. Enter how much of each line to credit.
          </DialogDescription>
        </DialogHeader>

        <form action={formAction}>
          <input type="hidden" name="lines" value={JSON.stringify(payload)} />

          <DialogBody className="space-y-3">
            {lines.map((line) => (
              <div key={line.id} className="flex items-center justify-between gap-3 rounded-md border border-hairline px-3 py-2.5">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-ink">{line.productName}</div>
                  <Code className="text-2xs text-ink-subtle">
                    {line.productSku} · {line.quantity} {line.uomCode} billed · <Money value={line.unitPrice} currency={currency} />
                  </Code>
                </div>
                <Input
                  type="number"
                  min="0"
                  max={line.quantity}
                  step="0.000001"
                  value={quantities[line.id] ?? 0}
                  onChange={(e) => setQuantities((q) => ({ ...q, [line.id]: Number(e.target.value) || 0 }))}
                  className="h-8 w-24 text-right text-xs tnum"
                />
              </div>
            ))}

            <div className="space-y-1.5 pt-1">
              <Label htmlFor="reason" required>
                Reason
              </Label>
              <Textarea id="reason" name="reason" placeholder="Why is this being credited?" required />
              {state.fieldErrors?.reason ? <p className="text-2xs text-danger">{state.fieldErrors.reason}</p> : null}
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
            <Button type="submit" variant="primary" size="md" disabled={pending || payload.length === 0}>
              {pending ? "Issuing..." : "Issue credit note"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
