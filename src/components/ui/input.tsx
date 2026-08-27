import * as React from "react";
import { cn } from "@/lib/utils";

const fieldBase =
  "w-full rounded-md border border-hairline-strong bg-surface text-sm text-ink placeholder:text-ink-subtle transition-colors hover:border-ink-subtle focus:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/25 disabled:cursor-not-allowed disabled:bg-surface-sunken disabled:text-ink-subtle";

export function Input({ className, ...props }: React.ComponentProps<"input">) {
  return <input className={cn(fieldBase, "h-control px-2.5", className)} {...props} />;
}

export function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return <textarea className={cn(fieldBase, "min-h-20 px-2.5 py-2", className)} {...props} />;
}
