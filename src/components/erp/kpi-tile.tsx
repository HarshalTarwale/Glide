import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";

/** KPI figures use the display serif -- the one place big type appears. */
export function KpiTile({
  label,
  value,
  delta,
  hint,
  className,
}: {
  label: string;
  value: React.ReactNode;
  delta?: number;
  hint?: string;
  className?: string;
}) {
  const up = (delta ?? 0) >= 0;
  return (
    <div className={cn("rounded-lg border border-hairline bg-surface p-4", className)}>
      <div className="text-2xs font-medium uppercase tracking-wide text-ink-subtle">{label}</div>
      <div className="font-display mt-2 text-4xl leading-none text-ink">{value}</div>
      <div className="mt-2 flex items-center gap-2 text-xs">
        {delta !== undefined ? (
          <span className={cn("inline-flex items-center gap-0.5 font-medium", up ? "text-success" : "text-danger")}>
            {up ? <ArrowUpRight className="size-3" /> : <ArrowDownRight className="size-3" />}
            {Math.abs(delta)}%
          </span>
        ) : null}
        {hint ? <span className="text-ink-subtle">{hint}</span> : null}
      </div>
    </div>
  );
}
