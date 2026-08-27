"use client";

import Link from "next/link";
import { Bell, Check, ChevronDown, Monitor, Moon, Rows3, Search, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";
import { Kbd } from "@/components/ui/kbd";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { COUNTRY_LIST, getCountry } from "@/lib/i18n/countries";
import { signOutAction } from "@/lib/auth/actions";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function Topbar({
  company,
  userName,
  userEmail,
  country,
  onCountryChange,
  density,
  onDensityChange,
  onOpenPalette,
}: {
  company: string;
  userName: string;
  userEmail: string;
  country: string;
  onCountryChange: (code: string) => void;
  density: "comfortable" | "compact";
  onDensityChange: (d: "comfortable" | "compact") => void;
  onOpenPalette: () => void;
}) {
  const { setTheme } = useTheme();
  const pack = getCountry(country);

  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-hairline bg-surface px-4">
      {/* Company switcher: a tenant may hold several legal entities. */}
      <DropdownMenu>
        <DropdownMenuTrigger className="flex h-8 items-center gap-2 rounded-md px-2 text-sm font-medium text-ink transition-colors hover:bg-surface-sunken">
          <span className="flex size-5 items-center justify-center rounded bg-ink text-2xs font-bold text-ink-inverse">
            {company.slice(0, 1)}
          </span>
          <span className="max-w-40 truncate">{company}</span>
          <ChevronDown className="size-3.5 text-ink-subtle" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          <DropdownMenuLabel>Companies</DropdownMenuLabel>
          <DropdownMenuItem>
            {company}
            <Check className="ml-auto size-3.5 text-accent" />
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem>Add a company</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Global search opens the command palette. */}
      <button
        type="button"
        onClick={onOpenPalette}
        className="group mx-auto flex h-8 w-full max-w-md items-center gap-2 rounded-md border border-hairline bg-surface-sunken px-2.5 text-sm text-ink-subtle transition-colors hover:border-hairline-strong hover:text-ink-muted"
      >
        <Search className="size-3.5" />
        <span>Search or jump to...</span>
        <Kbd className="ml-auto">Ctrl K</Kbd>
      </button>

      <div className="flex items-center gap-0.5">
        {/* Country switcher -- drives currency, number format and tax rules. */}
        <DropdownMenu>
          <DropdownMenuTrigger className="flex h-8 items-center gap-1.5 rounded-md px-2 text-xs font-medium text-ink-muted transition-colors hover:bg-surface-sunken hover:text-ink">
            {pack.code} · {pack.currency}
            <ChevronDown className="size-3 text-ink-subtle" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            <DropdownMenuLabel>Country</DropdownMenuLabel>
            {COUNTRY_LIST.map((c) => (
              <DropdownMenuItem key={c.code} onClick={() => onCountryChange(c.code)}>
                <span>{c.name}</span>
                <span className="ml-auto text-2xs text-ink-subtle">
                  {c.currency} · {c.taxLabel}
                </span>
                {c.code === country ? <Check className="ml-1.5 size-3.5 text-accent" /> : null}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Density: power users live in compact. */}
        <button
          type="button"
          onClick={() => onDensityChange(density === "compact" ? "comfortable" : "compact")}
          className={cn(
            "flex size-8 items-center justify-center rounded-md transition-colors hover:bg-surface-sunken",
            density === "compact" ? "text-accent" : "text-ink-subtle hover:text-ink"
          )}
          aria-label={`Switch to ${density === "compact" ? "comfortable" : "compact"} density`}
          title={`Density: ${density}`}
        >
          <Rows3 className="size-4" />
        </button>

        <DropdownMenu>
          <DropdownMenuTrigger
            className="flex size-8 items-center justify-center rounded-md text-ink-subtle transition-colors hover:bg-surface-sunken hover:text-ink"
            aria-label="Theme"
          >
            <Sun className="size-4 dark:hidden" />
            <Moon className="hidden size-4 dark:block" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setTheme("light")}>
              <Sun /> Light
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setTheme("dark")}>
              <Moon /> Dark
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setTheme("system")}>
              <Monitor /> System
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <button
          type="button"
          className="flex size-8 items-center justify-center rounded-md text-ink-subtle transition-colors hover:bg-surface-sunken hover:text-ink"
          aria-label="Notifications"
        >
          <Bell className="size-4" />
        </button>

        <DropdownMenu>
          <DropdownMenuTrigger className="ml-1 rounded-full focus-visible:outline-none">
            <Avatar>
              <AvatarFallback>{initials(userName)}</AvatarFallback>
            </Avatar>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuLabel>{userName}</DropdownMenuLabel>
            <div className="truncate px-2 pb-2 text-xs text-ink-muted">{userEmail}</div>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/app/settings">Organisation settings</Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem destructive onClick={() => void signOutAction()}>
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("") || "?";
}
