"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Ban } from "lucide-react";
import { PageHeader } from "@/components/erp/page-header";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/erp/empty-state";
import { PermissionGate, useHasPermission } from "@/components/layout/session-context";
import type { BomDTO } from "@/server/manufacturing/boms";
import { BomForm } from "./bom-form";
import { deactivateBomAction } from "../actions";

export function BomsView({ boms, products }: { boms: BomDTO[]; products: { id: string; name: string; sku: string }[] }) {
  const router = useRouter();
  const canWrite = useHasPermission("manufacturing:bom:write");
  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<BomDTO | null>(null);

  function openCreate() {
    setEditing(null);
    setFormOpen(true);
  }

  function openEdit(bom: BomDTO) {
    if (!canWrite) return;
    setEditing(bom);
    setFormOpen(true);
  }

  function handleSaved() {
    toast.success(editing ? "BOM updated" : "BOM created");
    router.refresh();
  }

  async function handleDeactivate(id: string, name: string) {
    const result = await deactivateBomAction(id);
    if (result.ok) {
      toast.success(`${name} deactivated`);
      router.refresh();
    } else {
      toast.error(result.error ?? "Could not deactivate that BOM");
    }
  }

  return (
    <>
      <PageHeader
        title="Bills of Materials"
        crumbs={[{ label: "Manufacturing" }, { label: "Bills of Materials" }]}
        meta="What each product is made of, and how much of it a batch produces."
        actions={
          <PermissionGate permission="manufacturing:bom:write">
            <Button variant="primary" size="md" onClick={openCreate}>
              <Plus />
              New BOM
            </Button>
          </PermissionGate>
        }
      />

      <div className="flex-1 overflow-auto px-6 py-6">
        {boms.length === 0 ? (
          <EmptyState title="No bills of materials yet" description="Add one to define what a product is assembled from." />
        ) : (
          <div className="space-y-4">
            {boms.map((bom) => (
              <Card key={bom.id}>
                <CardHeader>
                  <div>
                    <CardTitle>
                      {bom.productName} <span className="font-mono text-2xs font-normal text-ink-subtle">({bom.productSku})</span>
                    </CardTitle>
                    <p className="mt-0.5 text-xs text-ink-subtle">Batch of {bom.quantity}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {bom.isActive ? (
                      <Badge tone="success" dot>
                        Active
                      </Badge>
                    ) : (
                      <Badge tone="neutral" dot>
                        Inactive
                      </Badge>
                    )}
                    {canWrite ? (
                      <Button variant="ghost" size="sm" onClick={() => openEdit(bom)}>
                        Edit
                      </Button>
                    ) : null}
                    {canWrite && bom.isActive ? (
                      <Button variant="ghost" size="iconSm" aria-label={`Deactivate ${bom.productName}`} onClick={() => void handleDeactivate(bom.id, bom.productName)}>
                        <Ban className="text-ink-subtle" />
                      </Button>
                    ) : null}
                  </div>
                </CardHeader>
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-hairline bg-surface-sunken text-2xs uppercase tracking-wide text-ink-subtle">
                      <th className="px-4 py-2 text-left font-semibold">Component</th>
                      <th className="px-4 py-2 text-right font-semibold">Qty per batch</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bom.lines.map((l) => (
                      <tr key={l.id} className="h-row border-b border-hairline last:border-0">
                        <td className="px-4">
                          <span className="font-medium text-ink">{l.componentName}</span>{" "}
                          <span className="font-mono text-2xs text-ink-subtle">({l.componentSku})</span>
                        </td>
                        <td className="tnum px-4 text-right">{l.quantity}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            ))}
          </div>
        )}
      </div>

      <BomForm open={formOpen} onOpenChange={setFormOpen} bom={editing} products={products} onSaved={handleSaved} />
    </>
  );
}
