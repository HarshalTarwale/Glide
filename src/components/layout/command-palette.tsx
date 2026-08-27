"use client";

import * as React from "react";
import { Command } from "cmdk";
import { useRouter } from "next/navigation";
import { ArrowRight, Plus } from "lucide-react";
import { NAV } from "./nav-config";
import { Kbd } from "@/components/ui/kbd";

/**
 * None of the incumbent ERPs are keyboard-first. This is the cheapest
 * place to be visibly faster than all of them.
 */
export function CommandPalette({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();

  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        onOpenChange(!open);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  function go(href: string) {
    onOpenChange(false);
    router.push(href);
  }

  const navItems = NAV.flatMap((g) => g.items.filter((i) => !i.soon).map((i) => ({ ...i, group: g.label })));

  return (
    <Command.Dialog
      open={open}
      onOpenChange={onOpenChange}
      label="Command palette"
      className="fixed inset-0 z-50"
      overlayClassName="fixed inset-0 z-50 bg-[var(--overlay)] backdrop-blur-[2px]"
      contentClassName="fixed left-1/2 top-[18%] z-50 w-full max-w-xl -translate-x-1/2 overflow-hidden rounded-lg border border-hairline bg-surface-raised shadow-raised"
    >
      <Command.Input
        placeholder="Search records, jump to a module, run an action..."
        className="h-12 w-full border-b border-hairline bg-transparent px-4 text-sm text-ink outline-none placeholder:text-ink-subtle"
      />
      <Command.List className="max-h-80 overflow-y-auto p-2">
        <Command.Empty className="px-3 py-8 text-center text-sm text-ink-subtle">
          No results.
        </Command.Empty>

        <Command.Group
          heading="Create"
          className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-2xs [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wide [&_[cmdk-group-heading]]:text-ink-subtle"
        >
          {[
            { label: "New sales order", href: "/app/sales/new" },
            { label: "New invoice", href: "/app/invoices/new" },
            { label: "New product", href: "/app/inventory/new" },
          ].map((a) => (
            <Command.Item
              key={a.label}
              onSelect={() => go(a.href)}
              className="flex cursor-pointer items-center gap-2.5 rounded-sm px-2 py-2 text-sm text-ink outline-none data-[selected=true]:bg-surface-sunken"
            >
              <Plus className="size-4 text-ink-subtle" />
              {a.label}
            </Command.Item>
          ))}
        </Command.Group>

        <Command.Group
          heading="Go to"
          className="mt-1 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-2xs [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wide [&_[cmdk-group-heading]]:text-ink-subtle"
        >
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <Command.Item
                key={item.href}
                value={`${item.group} ${item.label}`}
                onSelect={() => go(item.href)}
                className="flex cursor-pointer items-center gap-2.5 rounded-sm px-2 py-2 text-sm text-ink outline-none data-[selected=true]:bg-surface-sunken"
              >
                <Icon className="size-4 text-ink-subtle" />
                {item.label}
                <span className="ml-auto text-2xs text-ink-subtle">{item.group}</span>
              </Command.Item>
            );
          })}
        </Command.Group>
      </Command.List>

      <div className="flex items-center gap-3 border-t border-hairline px-3 py-2 text-2xs text-ink-subtle">
        <span className="flex items-center gap-1">
          <Kbd>&uarr;</Kbd>
          <Kbd>&darr;</Kbd> navigate
        </span>
        <span className="flex items-center gap-1">
          <Kbd>&crarr;</Kbd> open
        </span>
        <span className="ml-auto flex items-center gap-1">
          <ArrowRight className="size-3" /> Esc to close
        </span>
      </div>
    </Command.Dialog>
  );
}
