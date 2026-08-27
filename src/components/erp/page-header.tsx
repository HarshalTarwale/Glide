import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export interface Crumb {
  label: string;
  href?: string;
}

/**
 * Every list and record view opens with this. Identical anatomy across
 * all modules is what makes a user who has learned Sales able to operate
 * Procurement without instruction.
 */
export function PageHeader({
  title,
  crumbs,
  meta,
  actions,
  status,
  className,
}: {
  title: string;
  crumbs?: Crumb[];
  meta?: React.ReactNode;
  actions?: React.ReactNode;
  status?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("border-b border-hairline bg-surface px-6 pb-4 pt-5", className)}>
      {crumbs?.length ? (
        <nav className="mb-2 flex items-center gap-1 text-xs text-ink-subtle">
          {crumbs.map((c, i) => (
            <span key={c.label} className="flex items-center gap-1">
              {i > 0 && <ChevronRight className="size-3" />}
              {c.href ? (
                <Link href={c.href} className="transition-colors hover:text-ink">
                  {c.label}
                </Link>
              ) : (
                <span>{c.label}</span>
              )}
            </span>
          ))}
        </nav>
      ) : null}

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <h1 className="font-display text-3xl leading-none text-ink">{title}</h1>
            {status}
          </div>
          {meta ? <div className="mt-2 text-sm text-ink-muted">{meta}</div> : null}
        </div>
        {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
      </div>
    </div>
  );
}
