import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export interface StatusStep {
  id: string;
  label: string;
}

/**
 * Document lifecycle, rendered from a server-defined state machine.
 * The UI never decides which transitions are legal -- it renders the
 * states the server gave it and marks where the document currently is.
 */
export function StatusStepper({
  steps,
  current,
  cancelled = false,
  className,
}: {
  steps: StatusStep[];
  current: string;
  cancelled?: boolean;
  className?: string;
}) {
  const currentIndex = steps.findIndex((s) => s.id === current);

  if (cancelled) {
    return (
      <div className={cn("inline-flex items-center gap-2 rounded-full border border-danger/20 bg-danger-soft px-3 py-1", className)}>
        <span className="size-1.5 rounded-full bg-danger" />
        <span className="text-2xs font-medium text-danger">Cancelled</span>
      </div>
    );
  }

  return (
    <ol className={cn("flex items-center gap-1", className)}>
      {steps.map((step, i) => {
        const done = i < currentIndex;
        const active = i === currentIndex;
        return (
          <li key={step.id} className="flex items-center gap-1">
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-2xs font-medium transition-colors",
                active && "border-ink bg-ink text-ink-inverse",
                done && "border-hairline bg-surface-sunken text-ink-muted",
                !active && !done && "border-hairline bg-surface text-ink-subtle"
              )}
            >
              {done ? <Check className="size-3" /> : null}
              {step.label}
            </span>
            {i < steps.length - 1 ? <span className="h-px w-3 bg-hairline-strong" aria-hidden /> : null}
          </li>
        );
      })}
    </ol>
  );
}
