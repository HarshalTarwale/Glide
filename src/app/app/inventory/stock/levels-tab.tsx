"use client";

import { Money, Quantity, Code } from "@/components/erp/money";
import { EmptyState } from "@/components/erp/empty-state";
import { Badge } from "@/components/ui/badge";
import type { StockLevelDTO } from "@/server/inventory/stock";

export function LevelsTab({ levels, live }: { levels: StockLevelDTO[]; live: boolean }) {
  if (levels.length === 0) {
    return (
      <EmptyState
        title="No stock recorded yet"
        description={live ? "Receive your first stock to see it here." : "Connect a database to record real stock."}
      />
    );
  }

  return (
    <table className="w-full border-collapse text-sm">
      <thead className="sticky top-0 z-10">
        <tr className="border-b border-hairline bg-surface-sunken text-2xs font-semibold uppercase tracking-wide text-ink-subtle">
          <th className="px-6 py-2 text-left">Product</th>
          <th className="px-3 py-2 text-right">On hand</th>
          <th className="px-3 py-2 text-right">Avg. cost</th>
          <th className="px-3 py-2 text-right">Value</th>
          <th className="px-3 py-2 text-left">Status</th>
        </tr>
      </thead>
      <tbody>
        {levels.map((l) => (
          <tr key={l.productId} className="h-row border-b border-hairline bg-surface hover:bg-surface-sunken">
            <td className="px-6">
              <div className="font-medium text-ink">{l.name}</div>
              <Code className="text-2xs text-ink-subtle">{l.sku}</Code>
            </td>
            <td className="px-3 text-right">
              <Quantity value={l.onHand} uom={l.uomCode} />
            </td>
            <td className="px-3 text-right">
              {l.averageCost !== null ? <Money value={l.averageCost} className="text-ink-muted" /> : <span className="text-ink-subtle">—</span>}
            </td>
            <td className="px-3 text-right font-medium">
              {l.value !== null ? <Money value={l.value} /> : <span className="text-ink-subtle">—</span>}
            </td>
            <td className="px-3">
              {l.isLow ? (
                <Badge tone="warning" dot>
                  Below reorder point
                </Badge>
              ) : (
                <Badge tone="success" dot>
                  OK
                </Badge>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
