"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/erp/page-header";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/erp/empty-state";
import { PermissionGate, useHasPermission } from "@/components/layout/session-context";
import type { LedgerAccountDTO } from "@/server/accounting/accounts";
import { AccountForm } from "./account-form";
import { deactivateAccountAction } from "../actions";

const TYPE_TONE: Record<string, "neutral" | "info" | "warning" | "accent" | "success" | "danger"> = {
  asset: "accent",
  liability: "warning",
  equity: "info",
  revenue: "success",
  expense: "danger",
};

export function AccountsView({ accounts }: { accounts: LedgerAccountDTO[] }) {
  const router = useRouter();
  const canWrite = useHasPermission("accounting:account:write");
  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<LedgerAccountDTO | null>(null);

  function openCreate() {
    setEditing(null);
    setFormOpen(true);
  }

  function openEdit(account: LedgerAccountDTO) {
    if (!canWrite) return;
    setEditing(account);
    setFormOpen(true);
  }

  function handleSaved() {
    toast.success(editing ? "Account updated" : "Account created");
    router.refresh();
  }

  async function handleDeactivate(id: string, name: string) {
    const result = await deactivateAccountAction(id);
    if (result.ok) {
      toast.success(`${name} deactivated`);
      router.refresh();
    } else {
      toast.error(result.error ?? "Could not deactivate that account");
    }
  }

  return (
    <>
      <PageHeader
        title="Chart of Accounts"
        crumbs={[{ label: "Accounting" }, { label: "Chart of Accounts" }]}
        meta="The accounts your general ledger posts to — some automatically, from invoices and payments; the rest as you add them."
        actions={
          <PermissionGate permission="accounting:account:write">
            <Button variant="primary" size="md" onClick={openCreate}>
              <Plus />
              New account
            </Button>
          </PermissionGate>
        }
      />

      <div className="flex-1 overflow-auto px-6 py-6">
        {accounts.length === 0 ? (
          <EmptyState title="No accounts yet" description="Connect a database to see the chart of accounts." />
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>Accounts</CardTitle>
            </CardHeader>
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-hairline bg-surface-sunken text-2xs uppercase tracking-wide text-ink-subtle">
                  <th className="px-4 py-2 text-left font-semibold">Code</th>
                  <th className="px-4 py-2 text-left font-semibold">Name</th>
                  <th className="px-4 py-2 text-left font-semibold">Type</th>
                  <th className="px-4 py-2 text-left font-semibold">Status</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody>
                {accounts.map((a) => (
                  <tr key={a.id} className="h-row cursor-pointer border-b border-hairline last:border-0 hover:bg-surface-sunken" onClick={() => openEdit(a)}>
                    <td className="px-4 font-mono text-xs text-ink-muted">{a.code}</td>
                    <td className="px-4 font-medium text-ink">
                      {a.name}
                      {a.systemKey ? <span className="ml-1.5 text-2xs text-ink-subtle">(system)</span> : null}
                    </td>
                    <td className="px-4">
                      <Badge tone={TYPE_TONE[a.type] ?? "neutral"} dot>
                        {a.type}
                      </Badge>
                    </td>
                    <td className="px-4">
                      {a.isActive ? (
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
                      {canWrite && !a.systemKey && a.isActive ? (
                        <Button variant="ghost" size="iconSm" aria-label={`Deactivate ${a.name}`} onClick={() => void handleDeactivate(a.id, a.name)}>
                          <Trash2 className="text-ink-subtle" />
                        </Button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </div>

      <AccountForm open={formOpen} onOpenChange={setFormOpen} account={editing} onSaved={handleSaved} />
    </>
  );
}
