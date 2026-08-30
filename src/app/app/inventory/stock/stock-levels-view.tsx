"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, ArrowRightLeft, ClipboardEdit, PackagePlus, Truck } from "lucide-react";
import { PageHeader } from "@/components/erp/page-header";
import { Money, Quantity, Code } from "@/components/erp/money";
import { EmptyState } from "@/components/erp/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PermissionGate, useHasPermission } from "@/components/layout/session-context";
import type { StockLevelDTO } from "@/server/inventory/stock";
import type { StockFormOptions } from "@/server/inventory/stock-options";
import { StockMoveForm } from "./stock-move-form";

type MoveKind = "receipt" | "delivery" | "transfer" | "adjustment";

export function StockLevelsView({
  levels,
  options,
  live,
}: {
  levels: StockLevelDTO[];
  options: StockFormOptions;
  live: boolean;
}) {
  const router = useRouter();
  const canMove = useHasPermission("inventory:stock:move");
  const canAdjust = useHasPermission("inventory:stock:adjust");
  const [formOpen, setFormOpen] = React.useState(false);
  const [formKind, setFormKind] = React.useState<MoveKind>("receipt");

  function openForm(kind: MoveKind) {
    setFormKind(kind);
    setFormOpen(true);
  }

  function handleSaved() {
    toast.success("Stock move recorded");
    router.refresh();
  }

  const totalValue = levels.reduce((sum, l) => sum + l.value, 0);
  const lowCount = levels.filter((l) => l.isLow).length;

  return (
    <>
      <PageHeader
        title="Stock levels"
        crumbs={[{ label: "Inventory", href: "/app/inventory" }, { label: "Stock" }]}
        meta={
          live ? (
            <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <span>
                On-hand across all warehouses · total value <Money value={totalValue} className="font-medium" />
              </span>
              {lowCount > 0 ? (
                <span className="flex items-center gap-1 text-warning">
                  <AlertTriangle className="size-3.5" />
                  {lowCount} {lowCount === 1 ? "product" : "products"} below reorder point
                </span>
              ) : null}
            </span>
          ) : (
            "Demo stock levels — connect a database to record real moves."
          )
        }
        actions={
          <PermissionGate permission="inventory:stock:move">
            <Button variant="secondary" size="md" onClick={() => openForm("transfer")} disabled={!live}>
              <ArrowRightLeft />
              Transfer
            </Button>
            <PermissionGate permission="inventory:stock:adjust">
              <Button variant="secondary" size="md" onClick={() => openForm("adjustment")} disabled={!live}>
                <ClipboardEdit />
                Adjust
              </Button>
            </PermissionGate>
            <Button variant="secondary" size="md" onClick={() => openForm("delivery")} disabled={!live}>
              <Truck />
              Deliver
            </Button>
            <Button variant="primary" size="md" onClick={() => openForm("receipt")} disabled={!live}>
              <PackagePlus />
              Receive
            </Button>
          </PermissionGate>
        }
      />

      <div className="flex-1 overflow-auto">
        {levels.length === 0 ? (
          <EmptyState
            title="No stock recorded yet"
            description={live ? "Receive your first stock to see it here." : "Connect a database to record real stock."}
          />
        ) : (
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
                    <Money value={l.averageCost} className="text-ink-muted" />
                  </td>
                  <td className="px-3 text-right font-medium">
                    <Money value={l.value} />
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
        )}
      </div>

      {live && (canMove || canAdjust) ? (
        <StockMoveForm
          open={formOpen}
          onOpenChange={setFormOpen}
          options={options}
          defaultKind={formKind}
          onSaved={handleSaved}
        />
      ) : null}
    </>
  );
}
