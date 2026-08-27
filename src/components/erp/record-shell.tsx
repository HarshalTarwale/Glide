import { cn } from "@/lib/utils";

/**
 * The frame every record/detail page uses, in every module.
 * Left: the document body (tabs). Right: a metadata rail carrying
 * the chatter -- audit trail, attachments and, later, comments.
 */
export function RecordShell({
  header,
  smartButtons,
  children,
  rail,
  className,
}: {
  header: React.ReactNode;
  smartButtons?: React.ReactNode;
  children: React.ReactNode;
  rail?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex min-h-0 flex-1 flex-col", className)}>
      {header}
      {smartButtons ? (
        <div className="border-b border-hairline bg-surface px-6 py-3">{smartButtons}</div>
      ) : null}
      <div className="flex min-h-0 flex-1 overflow-auto">
        <div className="min-w-0 flex-1 px-6 py-5">{children}</div>
        {rail ? (
          <aside className="hidden w-72 shrink-0 border-l border-hairline bg-surface px-5 py-5 lg:block">
            {rail}
          </aside>
        ) : null}
      </div>
    </div>
  );
}

export function RailSection({
  title,
  children,
  className,
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("border-b border-hairline pb-4 mb-4 last:mb-0 last:border-0 last:pb-0", className)}>
      <h4 className="mb-2.5 text-2xs font-semibold uppercase tracking-wide text-ink-subtle">{title}</h4>
      {children}
    </section>
  );
}

export interface AuditEntry {
  id: string;
  actor: string;
  action: string;
  at: string;
}

/** Chatter, v1 scope: field-change audit trail. Comments land in P1. */
export function AuditTrail({ entries }: { entries: AuditEntry[] }) {
  return (
    <ol className="space-y-3">
      {entries.map((e) => (
        <li key={e.id} className="flex gap-2.5">
          <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-hairline-strong" aria-hidden />
          <div className="min-w-0">
            <p className="text-xs leading-snug text-ink">
              <span className="font-medium">{e.actor}</span> {e.action}
            </p>
            <p className="mt-0.5 text-2xs text-ink-subtle">{e.at}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}
