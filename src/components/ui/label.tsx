"use client";

import * as LabelPrimitive from "@radix-ui/react-label";
import { cn } from "@/lib/utils";

export function Label({
  className,
  required,
  children,
  ...props
}: React.ComponentProps<typeof LabelPrimitive.Root> & { required?: boolean }) {
  return (
    <LabelPrimitive.Root
      className={cn("text-xs font-medium text-ink-muted select-none", className)}
      {...props}
    >
      {children}
      {required ? <span className="ml-0.5 text-danger">*</span> : null}
    </LabelPrimitive.Root>
  );
}
