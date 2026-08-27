"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import { NAV } from "./nav-config";
import { GlideMark, GlideWordmark } from "./glide-mark";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export function Sidebar({
  collapsed,
  onToggle,
}: {
  collapsed: boolean;
  onToggle: () => void;
}) {
  const pathname = usePathname();

  return (
    <nav
      className={cn(
        "flex shrink-0 flex-col border-r border-hairline bg-surface transition-[width] duration-200",
        collapsed ? "w-14" : "w-56"
      )}
    >
      <div
        className={cn(
          "flex h-14 shrink-0 items-center border-b border-hairline",
          collapsed ? "justify-center px-0" : "justify-between px-4"
        )}
      >
        {collapsed ? (
          <Link href="/app" aria-label="Glide">
            <GlideMark className="size-4 text-ink" />
          </Link>
        ) : (
          <Link href="/app" aria-label="Glide">
            <GlideWordmark />
          </Link>
        )}
        {!collapsed ? (
          <button
            type="button"
            onClick={onToggle}
            className="rounded-sm p-1 text-ink-subtle transition-colors hover:bg-surface-sunken hover:text-ink"
            aria-label="Collapse sidebar"
          >
            <PanelLeftClose className="size-4" />
          </button>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto py-3">
        {NAV.map((group) => (
          <div key={group.label} className="mb-4 last:mb-0">
            {!collapsed ? (
              <div className="px-4 pb-1.5 text-2xs font-semibold uppercase tracking-wider text-ink-subtle">
                {group.label}
              </div>
            ) : (
              <div className="mx-3 mb-2 h-px bg-hairline" aria-hidden />
            )}
            <ul className="px-2">
              {group.items.map((item) => {
                const active =
                  item.href === "/app" ? pathname === "/app" : pathname.startsWith(item.href);
                const Icon = item.icon;

                const link = (
                  <Link
                    href={item.soon ? "#" : item.href}
                    aria-disabled={item.soon}
                    className={cn(
                      "group flex h-8 items-center gap-2.5 rounded-md px-2 text-sm transition-colors",
                      collapsed && "justify-center px-0",
                      item.soon
                        ? "cursor-not-allowed text-ink-subtle/60"
                        : active
                          ? "bg-surface-sunken font-medium text-ink"
                          : "text-ink-muted hover:bg-surface-sunken hover:text-ink"
                    )}
                  >
                    {/* The accent earns its keep here: it marks the active module. */}
                    {active && !collapsed ? (
                      <span className="absolute left-0 h-4 w-0.5 rounded-r bg-accent" aria-hidden />
                    ) : null}
                    <Icon className={cn("size-4 shrink-0", active && "text-accent")} />
                    {!collapsed ? (
                      <>
                        <span className="truncate">{item.label}</span>
                        {item.soon ? (
                          <span className="ml-auto text-2xs text-ink-subtle">Soon</span>
                        ) : null}
                      </>
                    ) : null}
                  </Link>
                );

                return (
                  <li key={item.label} className="relative">
                    {collapsed ? (
                      <Tooltip>
                        <TooltipTrigger asChild>{link}</TooltipTrigger>
                        <TooltipContent side="right">
                          {item.label}
                          {item.soon ? " (soon)" : ""}
                        </TooltipContent>
                      </Tooltip>
                    ) : (
                      link
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>

      {collapsed ? (
        <button
          type="button"
          onClick={onToggle}
          className="flex h-10 shrink-0 items-center justify-center border-t border-hairline text-ink-subtle transition-colors hover:bg-surface-sunken hover:text-ink"
          aria-label="Expand sidebar"
        >
          <PanelLeftOpen className="size-4" />
        </button>
      ) : null}
    </nav>
  );
}
