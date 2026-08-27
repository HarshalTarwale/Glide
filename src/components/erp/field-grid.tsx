import { cn } from "@/lib/utils";

/** The standard label/value layout used by every record view. */
export function FieldGrid({ className, ...props }: React.ComponentProps<"dl">) {
  return <dl className={cn("grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2", className)} {...props} />;
}

export function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <dt className="text-xs font-medium text-ink-muted">{label}</dt>
      <dd className="mt-1 text-sm text-ink">{children ?? <span className="text-ink-subtle">--</span>}</dd>
    </div>
  );
}

export function FormSection({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("border-b border-hairline py-6 first:pt-0 last:border-0", className)}>
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-ink">{title}</h3>
        {description ? <p className="mt-0.5 text-xs text-ink-muted">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}
