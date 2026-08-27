"use client";

import * as TabsPrimitive from "@radix-ui/react-tabs";
import { cn } from "@/lib/utils";

export const Tabs = TabsPrimitive.Root;

export function TabsList({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      className={cn("flex items-center gap-4 border-b border-hairline", className)}
      {...props}
    />
  );
}

/** Underline tabs, not pill tabs. Quieter, and reads as a document section. */
export function TabsTrigger({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        "-mb-px border-b-2 border-transparent px-0.5 pb-2.5 pt-2 text-sm font-medium text-ink-muted transition-colors",
        "hover:text-ink data-[state=active]:border-ink data-[state=active]:text-ink",
        className
      )}
      {...props}
    />
  );
}

export function TabsContent({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return <TabsPrimitive.Content className={cn("pt-4 focus:outline-none", className)} {...props} />;
}
