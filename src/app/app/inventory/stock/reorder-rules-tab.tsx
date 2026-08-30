"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Trash2, Warehouse } from "lucide-react";
import { Quantity, Code } from "@/components/erp/money";
import { EmptyState } from "@/components/erp/empty-state";
import { Button } from "@/components/ui/button";
import { PermissionGate, useHasPermission } from "@/components/layout/session-context";
import type { StockFormOptions } from "@/server/inventory/stock-options";
import type { ReorderRuleDTO } from "@/server/inventory/reorder-rules";
import { ReorderRuleForm } from "./reorder-rule-form";
import { deleteReorderRuleAction } from "./actions";

export function ReorderRulesTab({
  rules,
  options,
  warehouses,
  live,
}: {
  rules: ReorderRuleDTO[];
  options: StockFormOptions;
  warehouses: { id: string; code: string; name: string }[];
  live: boolean;
}) {
  const router = useRouter();
  const canWrite = useHasPermission("inventory:warehouse:write");
  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<ReorderRuleDTO | null>(null);

  function openCreate() {
    setEditing(null);
    setFormOpen(true);
  }

  function openEdit(rule: ReorderRuleDTO) {
    setEditing(rule);
    setFormOpen(true);
  }

  function handleSaved() {
    toast.success(editing ? "Reorder rule updated" : "Reorder rule created");
    router.refresh();
  }

  async function handleDelete(id: string, productName: string) {
    const result = await deleteReorderRuleAction(id);
    if (result.ok) {
      toast.success(`Reorder rule for ${productName} removed`);
      router.refresh();
    } else {
      toast.error(result.error ?? "Could not remove reorder rule");
    }
  }

  return (
    <div>
      <div className="flex justify-end border-b border-hairline px-6 py-2">
        <PermissionGate permission="inventory:warehouse:write">
          <Button variant="secondary" size="sm" onClick={openCreate} disabled={!live}>
            <Plus />
            New reorder rule
          </Button>
        </PermissionGate>
      </div>

      {rules.length === 0 ? (
        <EmptyState
          icon={Warehouse}
          title="No per-warehouse reorder rules yet"
          description={
            live
              ? "Set a threshold per product and warehouse to flag exactly where stock is running low."
              : "Connect a database to configure real reorder rules."
          }
        />
      ) : (
        <table className="w-full border-collapse text-sm">
          <thead className="sticky top-0 z-10">
            <tr className="border-b border-hairline bg-surface-sunken text-2xs font-semibold uppercase tracking-wide text-ink-subtle">
              <th className="px-6 py-2 text-left">Product</th>
              <th className="px-3 py-2 text-left">Warehouse</th>
              <th className="px-3 py-2 text-right">Reorder point</th>
              <th className="px-3 py-2 text-right">Reorder up to</th>
              <th className="w-10" />
            </tr>
          </thead>
          <tbody>
            {rules.map((r) => (
              <tr
                key={r.id}
                className="h-row cursor-pointer border-b border-hairline bg-surface hover:bg-surface-sunken"
                onClick={() => live && canWrite && openEdit(r)}
              >
                <td className="px-6">
                  <div className="font-medium text-ink">{r.productName}</div>
                  <Code className="text-2xs text-ink-subtle">{r.productSku}</Code>
                </td>
                <td className="px-3 text-ink-muted">{r.warehouseName}</td>
                <td className="px-3 text-right">
                  <Quantity value={r.minQty} />
                </td>
                <td className="px-3 text-right">{r.maxQty !== null ? <Quantity value={r.maxQty} /> : <span className="text-ink-subtle">—</span>}</td>
                <td className="px-2" onClick={(e) => e.stopPropagation()}>
                  {live && canWrite ? (
                    <Button variant="ghost" size="iconSm" aria-label={`Remove reorder rule for ${r.productName}`} onClick={() => void handleDelete(r.id, r.productName)}>
                      <Trash2 className="text-ink-subtle" />
                    </Button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {live && canWrite ? (
        <ReorderRuleForm
          open={formOpen}
          onOpenChange={setFormOpen}
          rule={editing}
          options={options}
          warehouses={warehouses}
          onSaved={handleSaved}
        />
      ) : null}
    </div>
  );
}
