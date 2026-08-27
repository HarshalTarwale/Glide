import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * StatusPill. Soft tinted background plus a dot, never a saturated block.
 * Document state is the single most-read value on any ERP screen, so it
 * gets one consistent treatment everywhere.
 */
const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-2xs font-medium whitespace-nowrap",
  {
    variants: {
      tone: {
        neutral: "bg-surface-sunken text-ink-muted border-hairline",
        accent: "bg-accent-soft text-accent border-accent/20",
        success: "bg-success-soft text-success border-success/20",
        warning: "bg-warning-soft text-warning border-warning/20",
        danger: "bg-danger-soft text-danger border-danger/20",
        info: "bg-info-soft text-info border-info/20",
      },
    },
    defaultVariants: { tone: "neutral" },
  }
);

export interface BadgeProps
  extends React.ComponentProps<"span">,
    VariantProps<typeof badgeVariants> {
  dot?: boolean;
}

export function Badge({ className, tone, dot = false, children, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ tone }), className)} {...props}>
      {dot ? <span className="size-1.5 rounded-full bg-current" aria-hidden /> : null}
      {children}
    </span>
  );
}

export { badgeVariants };
