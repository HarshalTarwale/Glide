"use client";

import { cn } from "@/lib/utils";
import { formatDate, formatMoney, formatQuantity } from "@/lib/format";
import { useFormatContext } from "./format-context";

/**
 * Money is always right-aligned with tabular figures so decimal points
 * line up down a column. Negatives are shown in the danger colour rather
 * than with a minus sign alone -- easier to scan in a long ledger.
 */
export function Money({
  value,
  currency,
  compact,
  className,
  muteZero = false,
}: {
  value: number;
  currency?: string;
  compact?: boolean;
  className?: string;
  muteZero?: boolean;
}) {
  const ctx = useFormatContext();
  const text = formatMoney(value, { ...ctx, currency: currency ?? ctx.currency }, { compact });
  return (
    <span
      className={cn(
        "tnum tabular-nums whitespace-nowrap",
        value < 0 && "text-danger",
        muteZero && value === 0 && "text-ink-subtle",
        className
      )}
    >
      {text}
    </span>
  );
}

export function Quantity({
  value,
  uom,
  className,
}: {
  value: number;
  uom?: string;
  className?: string;
}) {
  const ctx = useFormatContext();
  return (
    <span className={cn("tnum tabular-nums whitespace-nowrap", className)}>
      {formatQuantity(value, ctx, uom)}
    </span>
  );
}

export function DateText({ value, className }: { value: Date | string; className?: string }) {
  const ctx = useFormatContext();
  return <span className={cn("whitespace-nowrap", className)}>{formatDate(value, ctx)}</span>;
}

/** Document numbers, SKUs and codes: mono, slightly muted, never wrapped. */
export function Code({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={cn("font-mono text-sm tracking-tight whitespace-nowrap", className)}>{children}</span>
  );
}
