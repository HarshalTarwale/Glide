"use client";

import { Search, SlidersHorizontal, Star, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { FilterSpec, RecordQuery, SavedView } from "@/lib/query/record-query";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export interface QuickFilter {
  id: string;
  label: string;
  filters: FilterSpec[];
}

/**
 * Filters, Group By and Saved Views are three different things -- the
 * Stage 1 research finding. This bar exposes all three, and it is the
 * clearest single signal that separates an ERP from an admin panel.
 */
export function FilterBar({
  query,
  onQueryChange,
  quickFilters = [],
  groupableFields = [],
  savedViews = [],
  activeViewId,
  onSelectView,
  searchPlaceholder = "Search...",
}: {
  query: RecordQuery;
  onQueryChange: (q: RecordQuery) => void;
  quickFilters?: QuickFilter[];
  groupableFields?: { field: string; label: string }[];
  savedViews?: SavedView[];
  activeViewId?: string;
  onSelectView?: (v: SavedView) => void;
  searchPlaceholder?: string;
}) {
  const activeQuickIds = new Set(query.filters.map((f) => f.label ?? f.field));

  function toggleQuick(qf: QuickFilter) {
    const isOn = qf.filters.every((f) => activeQuickIds.has(f.label ?? f.field));
    const next = isOn
      ? query.filters.filter((f) => !qf.filters.some((q2) => (q2.label ?? q2.field) === (f.label ?? f.field)))
      : [...query.filters, ...qf.filters];
    onQueryChange({ ...query, filters: next, page: 1 });
  }

  function removeFilter(index: number) {
    const next = [...query.filters];
    next.splice(index, 1);
    onQueryChange({ ...query, filters: next, page: 1 });
  }

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-hairline bg-surface px-6 py-2.5">
      <div className="relative min-w-56 flex-1 max-w-sm">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-ink-subtle" />
        <input
          value={query.search ?? ""}
          onChange={(e) => onQueryChange({ ...query, search: e.target.value, page: 1 })}
          placeholder={searchPlaceholder}
          className="h-control w-full rounded-md border border-hairline bg-surface-sunken pl-8 pr-2.5 text-sm text-ink placeholder:text-ink-subtle transition-colors focus:border-accent focus:bg-surface focus-visible:outline-none"
        />
      </div>

      {quickFilters.map((qf) => {
        const on = qf.filters.every((f) => activeQuickIds.has(f.label ?? f.field));
        return (
          <button
            key={qf.id}
            type="button"
            onClick={() => toggleQuick(qf)}
            className={cn(
              "h-control rounded-md border px-2.5 text-xs font-medium transition-colors",
              on
                ? "border-ink bg-ink text-ink-inverse"
                : "border-hairline text-ink-muted hover:border-hairline-strong hover:text-ink"
            )}
          >
            {qf.label}
          </button>
        );
      })}

      {query.filters.map((f, i) => (
        <span
          key={`${f.field}-${i}`}
          className="inline-flex h-control items-center gap-1.5 rounded-md border border-accent/25 bg-accent-soft px-2.5 text-xs font-medium text-accent"
        >
          {f.label ?? f.field}
          <button type="button" onClick={() => removeFilter(i)} aria-label="Remove filter">
            <X className="size-3" />
          </button>
        </span>
      ))}

      <div className="ml-auto flex items-center gap-1.5">
        {groupableFields.length ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm">
                <SlidersHorizontal />
                {query.groupBy
                  ? `Grouped by ${groupableFields.find((g) => g.field === query.groupBy)?.label}`
                  : "Group by"}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Group rows by</DropdownMenuLabel>
              {groupableFields.map((g) => (
                <DropdownMenuItem key={g.field} onClick={() => onQueryChange({ ...query, groupBy: g.field })}>
                  {g.label}
                </DropdownMenuItem>
              ))}
              {query.groupBy ? (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => onQueryChange({ ...query, groupBy: undefined })}>
                    Clear grouping
                  </DropdownMenuItem>
                </>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}

        {savedViews.length ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm">
                <Star />
                {savedViews.find((v) => v.id === activeViewId)?.name ?? "Views"}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Saved views</DropdownMenuLabel>
              {savedViews.map((v) => (
                <DropdownMenuItem key={v.id} onClick={() => onSelectView?.(v)}>
                  {v.name}
                  {v.shared ? <span className="ml-auto text-2xs text-ink-subtle">Shared</span> : null}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem>Save current view...</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </div>
    </div>
  );
}
