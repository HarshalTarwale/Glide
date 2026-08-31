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
import { Button } from "@/components/ui/button";
import { Code } from "@/components/erp/money";
import type { InvoiceableOrderLineDTO } from "@/server/invoicing/options";
import { createInvoiceFromOrderAction, type ActionResult } from "../../invoices/actions";

export function InvoiceDialog({
  open,
  onOpenChange,
  orderId,
  lines,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderId: string;
  /** Only lines with something left to invoice, per the order's own invoicingPolicy. */
  lines: InvoiceableOrderLineDTO[];
}) {
  const action = createInvoiceFromOrderAction.bind(null, orderId);
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(action, { ok: false });

  const [quantities, setQuantities] = React.useState<Record<string, number>>(() =>
    Object.fromEntries(lines.map((l) => [l.id, l.remaining]))
  );

  const payload = lines
    .map((l) => ({ salesOrderLineId: l.id, quantity: quantities[l.id] ?? 0 }))
    .filter((l) => l.quantity > 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Create invoice</DialogTitle>
          <DialogDescription>Adjust the quantity per line, or leave the full remaining amount to invoice everything outstanding.</DialogDescription>
        </DialogHeader>

        <form action={formAction}>
          <input type="hidden" name="lines" value={JSON.stringify(payload)} />

          <DialogBody className="space-y-3">
            {lines.length === 0 ? (
              <p className="text-sm text-ink-muted">Nothing on this order is invoiceable yet.</p>
            ) : (
              lines.map((line) => (
                <div key={line.id} className="flex items-center justify-between gap-3 rounded-md border border-hairline px-3 py-2.5">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-ink">{line.productName}</div>
                    <Code className="text-2xs text-ink-subtle">
                      {line.productSku} · {line.remaining} {line.uomCode} remaining
                    </Code>
                  </div>
                  <Input
                    type="number"
                    min="0"
                    max={line.remaining}
                    step="0.000001"
                    value={quantities[line.id] ?? 0}
                    onChange={(e) => setQuantities((q) => ({ ...q, [line.id]: Number(e.target.value) || 0 }))}
                    className="h-8 w-24 text-right text-xs tnum"
                  />
                </div>
              ))
            )}

            <div className="space-y-1.5 pt-1">
              <Label htmlFor="invDueDate">Due date</Label>
              <Input id="invDueDate" name="dueDate" type="date" />
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
              {pending ? "Creating..." : "Create invoice"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
