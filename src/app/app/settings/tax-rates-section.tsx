"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/erp/empty-state";
import { PermissionGate, useHasPermission } from "@/components/layout/session-context";
import type { TaxRateDTO } from "@/server/core/tax-rates";
import { TaxRateForm } from "./tax-rate-form";
import { deleteTaxRateAction } from "./actions";

export function TaxRatesSection({
  rates,
  taxCategories,
  defaultCountry,
  live,
}: {
  rates: TaxRateDTO[];
  taxCategories: { id: string; key: string; name: string }[];
  defaultCountry: string;
  live: boolean;
}) {
  const router = useRouter();
  const canWrite = useHasPermission("core:settings:write");
  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<TaxRateDTO | null>(null);

  function openCreate() {
    setEditing(null);
    setFormOpen(true);
  }

  function openEdit(rate: TaxRateDTO) {
    if (!live || !canWrite) return;
    setEditing(rate);
    setFormOpen(true);
  }

  function handleSaved() {
    toast.success(editing ? "Tax rate updated" : "Tax rate created");
    router.refresh();
  }

  async function handleDelete(id: string, name: string) {
    const result = await deleteTaxRateAction(id);
    if (result.ok) {
      toast.success(`${name} removed`);
      router.refresh();
    } else {
      toast.error(result.error ?? "Could not remove tax rate");
    }
  }

  return (
    <Card className="lg:col-span-2">
      <CardHeader>
        <div>
          <CardTitle>Tax rates</CardTitle>
          <span className="text-2xs text-ink-subtle">
            US sales tax has no statutory default — configure jurisdiction rates here. India/UK/EU/UAE come pre-seeded but can be overridden.
          </span>
        </div>
        <PermissionGate permission="core:settings:write">
          <Button variant="secondary" size="sm" onClick={openCreate} disabled={!live}>
            <Plus />
            New rate
          </Button>
        </PermissionGate>
      </CardHeader>

      {rates.length === 0 ? (
        <EmptyState
          title="No tax rates configured"
          description={live ? "Add a rate for each jurisdiction you collect tax in." : "Connect a database to configure real tax rates."}
        />
      ) : (
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-hairline bg-surface-sunken text-2xs uppercase tracking-wide text-ink-subtle">
              <th className="px-4 py-2 text-left font-semibold">Name</th>
              <th className="px-4 py-2 text-left font-semibold">Country</th>
              <th className="px-4 py-2 text-left font-semibold">Region</th>
              <th className="px-4 py-2 text-left font-semibold">Level</th>
              <th className="px-4 py-2 text-right font-semibold">Rate</th>
              <th className="px-4 py-2 text-left font-semibold">Category</th>
              <th className="px-4 py-2 text-left font-semibold">Status</th>
              <th className="w-10" />
            </tr>
          </thead>
          <tbody>
            {rates.map((r) => (
              <tr
                key={r.id}
                className="h-row cursor-pointer border-b border-hairline last:border-0 hover:bg-surface-sunken"
                onClick={() => openEdit(r)}
              >
                <td className="px-4 font-medium text-ink">{r.name}</td>
                <td className="px-4 text-ink-muted">{r.country}</td>
                <td className="px-4 text-ink-muted">{r.region ?? "—"}</td>
                <td className="px-4 text-ink-muted capitalize">{r.level}</td>
                <td className="tnum px-4 text-right text-ink-muted">{r.rate}%</td>
                <td className="px-4 text-ink-muted">{r.categoryName ?? "All"}</td>
                <td className="px-4">
                  {r.isActive ? (
                    <Badge tone="success" dot>
                      Active
                    </Badge>
                  ) : (
                    <Badge tone="neutral" dot>
                      Inactive
                    </Badge>
                  )}
                </td>
                <td className="px-2" onClick={(e) => e.stopPropagation()}>
                  {live && canWrite ? (
                    <Button variant="ghost" size="iconSm" aria-label={`Remove ${r.name}`} onClick={() => void handleDelete(r.id, r.name)}>
                      <Trash2 className="text-ink-subtle" />
                    </Button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {live ? (
        <TaxRateForm
          open={formOpen}
          onOpenChange={setFormOpen}
          rate={editing}
          defaultCountry={defaultCountry}
          taxCategories={taxCategories}
          onSaved={handleSaved}
        />
      ) : null}
    </Card>
  );
}
