import { cn } from "@/lib/utils";

export function Kbd({ className, ...props }: React.ComponentProps<"kbd">) {
  return (
    <kbd
      className={cn(
        "inline-flex h-5 min-w-5 items-center justify-center rounded-sm border border-hairline bg-surface-sunken px-1 font-sans text-2xs font-medium text-ink-subtle",
        className
      )}
      {...props}
    />
  );
}
