"use client";

import * as React from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Money } from "./money";
import { useFormatContext } from "./format-context";
import { formatMoney } from "@/lib/format";

/**
 * The editable counterpart to LineItemsTable (Stage 2 shipped the read-only
 * version; this is the P3 piece it deferred). A row's product picker uses a
 * native <select> -- design-system.md's standing decision that a searchable
 * Combobox is built when a screen first needs to pick from hundreds of rows,
 * not spent speculatively here for a catalogue a v1 tenant can browse by eye.
 *
 * Tab order through the grid is the browser's own (native inputs, in DOM
 * order) rather than a custom arrow-key grid navigation -- a deliberate
 * scope line, not an oversight: real keyboard-row-navigation (arrow keys
 * moving between cells like a spreadsheet) is a genuine feature to build
 * against real usage feedback, not a speculative reimplementation of
 * <input> now.
 */

export interface LineItemOption {
  id: string;
  sku: string;
  name: string;
  salesPrice: number;
  uomCode: string;
}

export interface EditableLine {
  /** Stable client-side key; not persisted. */
  key: string;
  productId: string;
  qtyOrdered: number;
  unitPrice: number;
  discountPct: number;
}

function emptyLine(): EditableLine {
  return { key: crypto.randomUUID(), productId: "", qtyOrdered: 1, unitPrice: 0, discountPct: 0 };
}

export function LineItemsEditor({
  products,
  value,
  onChange,
  currency,
}: {
  products: LineItemOption[];
  value: EditableLine[];
  onChange: (lines: EditableLine[]) => void;
  currency?: string;
}) {
  const ctx = useFormatContext();

  function addLine() {
    onChange([...value, emptyLine()]);
  }

  function removeLine(key: string) {
    onChange(value.filter((l) => l.key !== key));
  }

  function updateLine(key: string, patch: Partial<EditableLine>) {
    onChange(
      value.map((l) => {
        if (l.key !== key) return l;
        const next = { ...l, ...patch };
        // Picking a product fills in a sensible default price -- the user
        // can still override it per line (a one-off discount negotiated on
        // the phone, say) without that override surviving a later product
        // change.
        if (patch.productId && patch.productId !== l.productId) {
          const product = products.find((p) => p.id === patch.productId);
          if (product) next.unitPrice = product.salesPrice;
        }
        return next;
      })
    );
  }

  const subtotal = value.reduce((sum, l) => {
    const gross = l.qtyOrdered * l.unitPrice;
    return sum + (gross - gross * (l.discountPct / 100));
  }, 0);

  return (
    <div className="overflow-hidden rounded-lg border border-hairline">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-hairline bg-surface-sunken text-2xs uppercase tracking-wide text-ink-subtle">
              <th className="px-3 py-2 text-left font-semibold">Product</th>
              <th className="w-28 px-3 py-2 text-right font-semibold">Qty</th>
              <th className="w-32 px-3 py-2 text-right font-semibold">Unit price</th>
              <th className="w-24 px-3 py-2 text-right font-semibold">Disc. %</th>
              <th className="w-32 px-3 py-2 text-right font-semibold">Line total</th>
              <th className="w-10" />
            </tr>
          </thead>
          <tbody>
            {value.map((line) => {
              const product = products.find((p) => p.id === line.productId);
              const gross = line.qtyOrdered * line.unitPrice;
              const total = gross - gross * (line.discountPct / 100);
              return (
                <tr key={line.key} className="h-row border-b border-hairline bg-surface last:border-0">
                  <td className="px-3">
                    <Select
                      aria-label="Product"
                      value={line.productId}
                      onChange={(e) => updateLine(line.key, { productId: e.target.value })}
                      className="h-8 text-xs"
                    >
                      <option value="">Select a product...</option>
                      {products.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} ({p.sku})
                        </option>
                      ))}
                    </Select>
                  </td>
                  <td className="px-3 text-right">
                    <Input
                      aria-label="Quantity"
                      type="number"
                      min="0.000001"
                      step="0.000001"
                      value={line.qtyOrdered}
                      onChange={(e) => updateLine(line.key, { qtyOrdered: Number(e.target.value) || 0 })}
                      className="h-8 text-right text-xs tnum"
                    />
                    {product ? <div className="mt-0.5 text-2xs text-ink-subtle">{product.uomCode}</div> : null}
                  </td>
                  <td className="px-3 text-right">
                    <Input
                      aria-label="Unit price"
                      type="number"
                      min="0"
                      step="0.01"
                      value={line.unitPrice}
                      onChange={(e) => updateLine(line.key, { unitPrice: Number(e.target.value) || 0 })}
                      className="h-8 text-right text-xs tnum"
                    />
                  </td>
                  <td className="px-3 text-right">
                    <Input
                      aria-label="Discount percent"
                      type="number"
                      min="0"
                      max="100"
                      step="0.01"
                      value={line.discountPct}
                      onChange={(e) => updateLine(line.key, { discountPct: Number(e.target.value) || 0 })}
                      className="h-8 text-right text-xs tnum"
                    />
                  </td>
                  <td className="px-3 text-right font-medium">
                    <Money value={total} currency={currency} />
                  </td>
                  <td className="px-2 text-right">
                    <Button
                      type="button"
                      variant="ghost"
                      size="iconSm"
                      aria-label="Remove line"
                      onClick={() => removeLine(line.key)}
                    >
                      <Trash2 />
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between border-t border-hairline bg-surface-sunken px-3 py-2.5">
        <Button type="button" variant="ghost" size="sm" onClick={addLine}>
          <Plus />
          Add line
        </Button>
        <div className="text-sm">
          <span className="text-ink-muted">Subtotal (before tax): </span>
          <span className="font-medium tnum">{formatMoney(subtotal, { ...ctx, currency: currency ?? ctx.currency })}</span>
        </div>
      </div>
    </div>
  );
}
