import Link from "next/link";
import { cn } from "@/lib/utils";

export interface SmartButton {
  label: string;
  value: string | number;
  href: string;
  icon?: React.ComponentType<{ className?: string }>;
}

/**
 * The single most useful navigation pattern in an ERP: from any document,
 * jump to the documents it produced or came from. Users walk the document
 * graph from where they are rather than going back to a list and searching.
 */
export function SmartButtons({ items, className }: { items: SmartButton[]; className?: string }) {
  if (!items.length) return null;
  return (
    <div className={cn("flex flex-wrap items-stretch gap-2", className)}>
      {items.map(({ label, value, href, icon: Icon }) => (
        <Link
          key={label}
          href={href}
          className="group flex min-w-28 flex-col justify-center rounded-md border border-hairline bg-surface px-3 py-2 transition-colors hover:border-hairline-strong hover:bg-surface-sunken"
        >
          <span className="flex items-center gap-1.5 text-2xs font-medium uppercase tracking-wide text-ink-subtle">
            {Icon ? <Icon className="size-3" /> : null}
            {label}
          </span>
          <span className="tnum mt-0.5 text-lg font-semibold leading-tight text-ink">{value}</span>
        </Link>
      ))}
    </div>
  );
}
