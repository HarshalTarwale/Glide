import { cn } from "@/lib/utils";

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center px-6 py-16 text-center", className)}>
      {Icon ? (
        <div className="mb-4 flex size-11 items-center justify-center rounded-full border border-hairline bg-surface-sunken">
          <Icon className="size-5 text-ink-subtle" />
        </div>
      ) : null}
      <h3 className="font-display text-2xl text-ink">{title}</h3>
      {description ? <p className="mt-1.5 max-w-sm text-sm text-ink-muted">{description}</p> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
