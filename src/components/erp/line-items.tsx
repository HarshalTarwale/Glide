"use client";

import { Trash2 } from "lucide-react";
import { Money, Quantity } from "./money";
import { Button } from "@/components/ui/button";

export interface LineItem {
  id: string;
  product: string;
  sku: string;
  qty: number;
  uom: string;
  unitPrice: number;
  discountPct: number;
  taxLabel: string;
  taxAmount: number;
  total: number;
}

/**
 * The heart of every ERP document. Read-only in Stage 2 -- the editable
 * grid with keyboard row navigation arrives with the Sales module (P3),
 * once products and price lists exist to populate it.
 */
export function LineItemsTable({
  lines,
  taxBreakdown,
  currency,
}: {
  lines: LineItem[];
  taxBreakdown: { label: string; amount: number }[];
  currency?: string;
}) {
  const subtotal = lines.reduce((s, l) => s + l.qty * l.unitPrice * (1 - l.discountPct / 100), 0);
  const taxTotal = taxBreakdown.reduce((s, t) => s + t.amount, 0);

  return (
    <div className="overflow-hidden rounded-lg border border-hairline">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-hairline bg-surface-sunken text-2xs uppercase tracking-wide text-ink-subtle">
              <th className="px-3 py-2 text-left font-semibold">Product</th>
              <th className="px-3 py-2 text-right font-semibold">Qty</th>
              <th className="px-3 py-2 text-right font-semibold">Unit price</th>
              <th className="px-3 py-2 text-right font-semibold">Disc.</th>
              <th className="px-3 py-2 text-right font-semibold">Tax</th>
              <th className="px-3 py-2 text-right font-semibold">Total</th>
              <th className="w-10" />
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.id} className="h-row border-b border-hairline bg-surface last:border-0">
                <td className="px-3">
                  <div className="font-medium text-ink">{l.product}</div>
                  <div className="font-mono text-2xs text-ink-subtle">{l.sku}</div>
                </td>
                <td className="px-3 text-right">
                  <Quantity value={l.qty} uom={l.uom} />
                </td>
                <td className="px-3 text-right">
                  <Money value={l.unitPrice} currency={currency} />
                </td>
                <td className="tnum px-3 text-right text-ink-muted">
                  {l.discountPct ? `${l.discountPct}%` : "--"}
                </td>
                <td className="px-3 text-right">
                  <div className="text-2xs text-ink-subtle">{l.taxLabel}</div>
                  <Money value={l.taxAmount} currency={currency} className="text-xs" />
                </td>
                <td className="px-3 text-right font-medium">
                  <Money value={l.total} currency={currency} />
                </td>
                <td className="px-2 text-right">
                  <Button variant="ghost" size="iconSm" aria-label="Remove line">
                    <Trash2 />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex justify-end border-t border-hairline bg-surface-sunken px-3 py-3">
        <dl className="w-64 space-y-1.5 text-sm">
          <div className="flex justify-between">
            <dt className="text-ink-muted">Subtotal</dt>
            <dd><Money value={subtotal} currency={currency} /></dd>
          </div>
          {taxBreakdown.map((t) => (
            <div key={t.label} className="flex justify-between">
              <dt className="text-ink-muted">{t.label}</dt>
              <dd><Money value={t.amount} currency={currency} /></dd>
            </div>
          ))}
          <div className="flex justify-between border-t border-hairline-strong pt-1.5 text-base font-semibold">
            <dt>Total</dt>
            <dd><Money value={subtotal + taxTotal} currency={currency} /></dd>
          </div>
        </dl>
      </div>
    </div>
  );
}
