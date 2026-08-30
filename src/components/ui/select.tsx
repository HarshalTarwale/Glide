import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * A native <select>, styled to match Input/Button. Deliberately not a Radix
 * Combobox -- forms in this app pick from short, fixed lists (a UoM, a tax
 * category, a warehouse), where the browser's own picker is faster and more
 * accessible than reimplementing one. A searchable Combobox gets built when
 * a screen first needs to pick from hundreds of rows (e.g. product lookup
 * inside a sales order line), not speculatively now.
 */
export function Select({ className, children, ...props }: React.ComponentProps<"select">) {
  return (
    <div className="relative">
      <select
        className={cn(
          "h-control w-full appearance-none rounded-md border border-hairline-strong bg-surface pl-2.5 pr-8 text-sm text-ink",
          "transition-colors hover:border-ink-subtle",
          "focus:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/25",
          "disabled:cursor-not-allowed disabled:bg-surface-sunken disabled:text-ink-subtle",
          className
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 size-3.5 -translate-y-1/2 text-ink-subtle" />
    </div>
  );
}
