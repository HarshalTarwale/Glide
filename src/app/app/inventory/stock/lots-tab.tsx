"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CalendarClock, PackageSearch } from "lucide-react";
import { Quantity, Code, DateText } from "@/components/erp/money";
import { EmptyState } from "@/components/erp/empty-state";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useHasPermission } from "@/components/layout/session-context";
import type { LotDTO } from "@/server/inventory/lots";
import { updateLotExpiryAction } from "./actions";

/**
 * Lots are created implicitly by the first move that references them (see
 * stock.ts's recordMove), so this is read-only traceability plus the one
 * field a receipt can't always know up front: expiry date.
 */
export function LotsTab({ lots, live }: { lots: LotDTO[]; live: boolean }) {
  const router = useRouter();
  const canEdit = useHasPermission("inventory:stock:move");

  async function handleExpiryChange(lotId: string, value: string) {
    const result = await updateLotExpiryAction(lotId, value || null);
    if (result.ok) {
      toast.success("Expiry updated");
      router.refresh();
    } else {
      toast.error(result.error ?? "Could not update expiry");
    }
  }

  if (lots.length === 0) {
    return (
      <EmptyState
        icon={PackageSearch}
        title="No lots or serials yet"
        description={
          live
            ? "A lot is created automatically the first time you receive a lot- or serial-tracked product."
            : "Connect a database to see real lot traceability."
        }
      />
    );
  }

  return (
    <table className="w-full border-collapse text-sm">
      <thead className="sticky top-0 z-10">
        <tr className="border-b border-hairline bg-surface-sunken text-2xs font-semibold uppercase tracking-wide text-ink-subtle">
          <th className="px-6 py-2 text-left">Lot / serial</th>
          <th className="px-3 py-2 text-left">Product</th>
          <th className="px-3 py-2 text-right">On hand</th>
          <th className="px-3 py-2 text-left">Expiry</th>
        </tr>
      </thead>
      <tbody>
        {lots.map((l) => (
          <tr key={l.id} className="h-row border-b border-hairline bg-surface hover:bg-surface-sunken">
            <td className="px-6">
              <Code className="font-medium text-ink">{l.code}</Code>
            </td>
            <td className="px-3">
              <div className="text-ink">{l.productName}</div>
              <Code className="text-2xs text-ink-subtle">{l.productSku}</Code>
            </td>
            <td className="px-3 text-right">
              <Quantity value={l.onHand} uom={l.uomCode} />
            </td>
            <td className="px-3">
              <div className="flex items-center gap-2">
                {live && canEdit ? (
                  <Input
                    type="date"
                    defaultValue={l.expiresAt ? l.expiresAt.slice(0, 10) : ""}
                    onBlur={(e) => {
                      if (e.target.value !== (l.expiresAt?.slice(0, 10) ?? "")) {
                        void handleExpiryChange(l.id, e.target.value);
                      }
                    }}
                    className="h-8 w-36 text-xs"
                  />
                ) : l.expiresAt ? (
                  <DateText value={l.expiresAt} />
                ) : (
                  <span className="text-ink-subtle">—</span>
                )}
                {l.isExpiringSoon ? (
                  <Badge tone="warning">
                    <CalendarClock className="size-3" />
                    Expiring soon
                  </Badge>
                ) : null}
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
