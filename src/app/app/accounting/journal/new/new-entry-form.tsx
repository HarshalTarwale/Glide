"use client";

import * as React from "react";
import { useActionState } from "react";
import { AlertCircle, Plus, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/erp/page-header";
import { FormSection } from "@/components/erp/field-grid";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { isBalanced, sumLines } from "@/lib/accounting/journal";
import type { LedgerAccountDTO } from "@/server/accounting/accounts";
import { createJournalEntryAction, type ActionResult } from "../../actions";

interface EditableLine {
  key: string;
  accountId: string;
  description: string;
  debit: number;
  credit: number;
}

function emptyLine(): EditableLine {
  return { key: crypto.randomUUID(), accountId: "", description: "", debit: 0, credit: 0 };
}

/**
 * Two lines to start: the minimum a journal entry can ever have. The live
 * balance indicator below runs isBalanced()/sumLines() from
 * src/lib/accounting/journal.ts -- the SAME pure functions the server
 * checks before allowing a post -- so what this form shows can never
 * disagree with what posting will actually accept.
 */
export function NewJournalEntryForm({ accounts }: { accounts: LedgerAccountDTO[] }) {
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(createJournalEntryAction, { ok: false });
  const [lines, setLines] = React.useState<EditableLine[]>([emptyLine(), emptyLine()]);

  const { totalDebit, totalCredit } = sumLines(lines);
  const balanced = isBalanced(lines);
  const err = (field: string) => state.fieldErrors?.[field];

  const payload = lines
    .filter((l) => l.accountId && (l.debit > 0 || l.credit > 0))
    .map((l) => ({ accountId: l.accountId, description: l.description || null, debit: l.debit, credit: l.credit }));

  function updateLine(key: string, patch: Partial<EditableLine>) {
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  function removeLine(key: string) {
    setLines((ls) => (ls.length > 2 ? ls.filter((l) => l.key !== key) : ls));
  }

  return (
    <>
      <PageHeader title="New journal entry" crumbs={[{ label: "Accounting" }, { label: "Journal Entries", href: "/app/accounting/journal" }, { label: "New entry" }]} />

      <form action={formAction} className="flex-1 overflow-auto px-6 py-5">
        <input type="hidden" name="lines" value={JSON.stringify(payload)} />

        <FormSection title="Entry details" className="pt-0">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="date" required>
                Date
              </Label>
              <Input id="date" name="date" type="date" defaultValue={new Date().toISOString().slice(0, 10)} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="description" required>
                Description
              </Label>
              <Input id="description" name="description" placeholder="What is this entry for?" required />
              {err("description") ? <p className="text-2xs text-danger">{err("description")}</p> : null}
            </div>
          </div>
        </FormSection>

        <FormSection title="Lines">
          <div className="overflow-hidden rounded-lg border border-hairline">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-hairline bg-surface-sunken text-2xs uppercase tracking-wide text-ink-subtle">
                  <th className="px-3 py-2 text-left font-semibold">Account</th>
                  <th className="px-3 py-2 text-left font-semibold">Description</th>
                  <th className="px-3 py-2 text-right font-semibold">Debit</th>
                  <th className="px-3 py-2 text-right font-semibold">Credit</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody>
                {lines.map((line) => (
                  <tr key={line.key} className="border-b border-hairline last:border-0">
                    <td className="px-3 py-1.5">
                      <Select
                        value={line.accountId}
                        onChange={(e) => updateLine(line.key, { accountId: e.target.value })}
                        className="h-8 text-xs"
                      >
                        <option value="">Select...</option>
                        {accounts.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.code} — {a.name}
                          </option>
                        ))}
                      </Select>
                    </td>
                    <td className="px-3 py-1.5">
                      <Input
                        value={line.description}
                        onChange={(e) => updateLine(line.key, { description: e.target.value })}
                        placeholder="Optional"
                        className="h-8 text-xs"
                      />
                    </td>
                    <td className="px-3 py-1.5">
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={line.debit || ""}
                        onChange={(e) => updateLine(line.key, { debit: Number(e.target.value) || 0, credit: 0 })}
                        className="h-8 w-28 text-right text-xs tnum"
                      />
                    </td>
                    <td className="px-3 py-1.5">
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={line.credit || ""}
                        onChange={(e) => updateLine(line.key, { credit: Number(e.target.value) || 0, debit: 0 })}
                        className="h-8 w-28 text-right text-xs tnum"
                      />
                    </td>
                    <td className="px-2">
                      <Button type="button" variant="ghost" size="iconSm" onClick={() => removeLine(line.key)} disabled={lines.length <= 2} aria-label="Remove line">
                        <Trash2 className="text-ink-subtle" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-hairline bg-surface-sunken font-medium">
                  <td colSpan={2} className="px-3 py-2 text-right text-xs text-ink-muted">
                    Totals
                  </td>
                  <td className="px-3 py-2 text-right text-xs tnum">{totalDebit.toFixed(2)}</td>
                  <td className="px-3 py-2 text-right text-xs tnum">{totalCredit.toFixed(2)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>

          <div className="mt-2 flex items-center justify-between">
            <Button type="button" variant="ghost" size="sm" onClick={() => setLines((ls) => [...ls, emptyLine()])}>
              <Plus />
              Add line
            </Button>
            <span className={`text-xs font-medium ${balanced ? "text-success" : "text-danger"}`}>
              {balanced ? "Balanced" : `Out of balance by ${Math.abs(totalDebit - totalCredit).toFixed(2)}`}
            </span>
          </div>
          {err("lines") ? <p className="mt-2 text-2xs text-danger">{err("lines")}</p> : null}
        </FormSection>

        {state.error ? (
          <div role="alert" className="mt-4 flex items-start gap-2 rounded-md border border-danger/20 bg-danger-soft px-3 py-2 text-xs text-danger">
            <AlertCircle className="mt-px size-3.5 shrink-0" />
            <span>{state.error}</span>
          </div>
        ) : null}

        <div className="mt-6 flex justify-end gap-2 border-t border-hairline pt-4">
          <Button type="submit" variant="primary" size="md" disabled={pending || payload.length < 2}>
            {pending ? "Creating..." : "Create draft"}
          </Button>
        </div>
      </form>
    </>
  );
}
