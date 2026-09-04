"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Ban, CheckCircle2 } from "lucide-react";
import { PageHeader } from "@/components/erp/page-header";
import { RecordShell } from "@/components/erp/record-shell";
import { FieldGrid, Field } from "@/components/erp/field-grid";
import { Money, DateText } from "@/components/erp/money";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PermissionGate, useHasPermission } from "@/components/layout/session-context";
import type { JournalEntryDTO } from "@/server/accounting/journal-entries";
import { postJournalEntryAction, deleteJournalEntryAction } from "../../actions";

const STATUS_TONE: Record<string, "neutral" | "success"> = { draft: "neutral", posted: "success" };
const STATUS_LABEL: Record<string, string> = { draft: "Draft", posted: "Posted" };

/** Where a document is knowable from its own id, for auto-posted entries. */
const SOURCE_ROUTE: Record<string, (id: string) => string> = {
  Invoice: (id) => `/app/invoices/${id}`,
  Payment: (id) => `/app/payments/${id}`,
};

export function EntryView({ entry }: { entry: JournalEntryDTO }) {
  const router = useRouter();
  const canPost = useHasPermission("accounting:journal:post");
  const canWrite = useHasPermission("accounting:journal:write");
  const [busy, setBusy] = React.useState(false);

  async function handlePost() {
    setBusy(true);
    const result = await postJournalEntryAction(entry.id);
    setBusy(false);
    if (result.ok) {
      toast.success("Journal entry posted");
      router.refresh();
    } else {
      toast.error(result.error ?? "Could not post this entry");
    }
  }

  async function handleDelete() {
    setBusy(true);
    const result = await deleteJournalEntryAction(entry.id);
    setBusy(false);
    if (result.ok) {
      toast.success("Draft deleted");
      router.push("/app/accounting/journal");
    } else {
      toast.error(result.error ?? "Could not delete this entry");
      setBusy(false);
    }
  }

  const sourceHref = entry.sourceType && entry.sourceId ? SOURCE_ROUTE[entry.sourceType]?.(entry.sourceId) : null;
  const isDraft = entry.status === "draft";

  return (
    <RecordShell
      header={
        <PageHeader
          title={entry.number}
          crumbs={[{ label: "Accounting" }, { label: "Journal Entries", href: "/app/accounting/journal" }, { label: entry.number }]}
          status={
            <Badge tone={STATUS_TONE[entry.status] ?? "neutral"} dot>
              {STATUS_LABEL[entry.status] ?? entry.status}
            </Badge>
          }
          meta={
            <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <span>{entry.description}</span>
              <span className="text-ink-subtle">·</span>
              <span>
                <DateText value={entry.date} />
              </span>
              {sourceHref ? (
                <>
                  <span className="text-ink-subtle">·</span>
                  <Link href={sourceHref} className="text-accent hover:underline">
                    View {entry.sourceType}
                  </Link>
                </>
              ) : entry.sourceType ? (
                <>
                  <span className="text-ink-subtle">·</span>
                  <span>{entry.sourceType}</span>
                </>
              ) : null}
            </span>
          }
          actions={
            isDraft ? (
              <PermissionGate permission="accounting:journal:post">
                <Button variant="primary" size="md" onClick={handlePost} disabled={busy || !canPost}>
                  <CheckCircle2 />
                  Post
                </Button>
              </PermissionGate>
            ) : null
          }
        />
      }
    >
      <div className="overflow-hidden rounded-lg border border-hairline">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-hairline bg-surface-sunken text-2xs uppercase tracking-wide text-ink-subtle">
              <th className="px-3 py-2 text-left font-semibold">Account</th>
              <th className="px-3 py-2 text-left font-semibold">Description</th>
              <th className="px-3 py-2 text-right font-semibold">Debit</th>
              <th className="px-3 py-2 text-right font-semibold">Credit</th>
            </tr>
          </thead>
          <tbody>
            {entry.lines.map((l) => (
              <tr key={l.id} className="border-b border-hairline last:border-0">
                <td className="px-3 py-2">
                  <span className="font-mono text-xs text-ink-subtle">{l.accountCode}</span>{" "}
                  <span className="text-ink">{l.accountName}</span>
                </td>
                <td className="px-3 py-2 text-ink-muted">{l.description ?? "—"}</td>
                <td className="px-3 py-2 text-right tnum">{l.debit > 0 ? <Money value={l.debit} /> : "—"}</td>
                <td className="px-3 py-2 text-right tnum">{l.credit > 0 ? <Money value={l.credit} /> : "—"}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-hairline bg-surface-sunken font-medium">
              <td colSpan={2} className="px-3 py-2 text-right text-xs text-ink-muted">
                Totals
              </td>
              <td className="px-3 py-2 text-right tnum">
                <Money value={entry.totalDebit} />
              </td>
              <td className="px-3 py-2 text-right tnum">
                <Money value={entry.totalCredit} />
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {isDraft ? (
        <FieldGrid className="mt-4">
          <Field label="Notes">A draft entry&apos;s lines can only be changed by deleting it and creating a new one.</Field>
        </FieldGrid>
      ) : (
        <p className="mt-4 text-2xs text-ink-subtle">Posted — immutable. A correction is a new, opposite entry.</p>
      )}

      {isDraft ? (
        <PermissionGate permission="accounting:journal:write">
          <div className="mt-8 flex justify-end border-t border-hairline pt-4">
            <Button variant="ghost" size="sm" className="text-danger hover:bg-danger-soft" onClick={handleDelete} disabled={busy || !canWrite}>
              <Ban />
              Delete draft
            </Button>
          </div>
        </PermissionGate>
      ) : null}
    </RecordShell>
  );
}
