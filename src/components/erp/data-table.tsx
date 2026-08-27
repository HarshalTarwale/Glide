"use client";

import * as React from "react";
import { ArrowDown, ArrowUp, ChevronsUpDown, Columns3, Inbox } from "lucide-react";
import { cn } from "@/lib/utils";
import type { RecordPage, RecordQuery } from "@/lib/query/record-query";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { EmptyState } from "./empty-state";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export interface Column<T> {
  id: string;
  header: string;
  /** Field path used for sorting. Omit to make the column unsortable. */
  sortField?: string;
  cell: (row: T) => React.ReactNode;
  align?: "left" | "right";
  width?: string;
  /** Hidden by default but available in the column picker. */
  optional?: boolean;
}

export interface DataTableProps<T> {
  data: RecordPage<T>;
  columns: Column<T>[];
  query: RecordQuery;
  onQueryChange: (q: RecordQuery) => void;
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  /** Rendered in the bulk bar when rows are selected. */
  bulkActions?: (ctx: { selectedCount: number; allMatching: boolean }) => React.ReactNode;
  emptyTitle?: string;
  emptyDescription?: string;
}

/**
 * The one table in the application. Every module uses it; no module writes
 * its own. It is a pure RENDERER -- all filtering, sorting and pagination
 * state lives in the RecordQuery passed in, so the same query can also feed
 * a kanban or pivot view later without touching this file.
 */
export function DataTable<T>({
  data,
  columns,
  query,
  onQueryChange,
  rowKey,
  onRowClick,
  bulkActions,
  emptyTitle = "Nothing here yet",
  emptyDescription,
}: DataTableProps<T>) {
  const [hidden, setHidden] = React.useState<Set<string>>(
    () => new Set(columns.filter((c) => c.optional).map((c) => c.id))
  );
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  /** Distinct from "every row on this page" -- lets a user act on 3,400 records. */
  const [allMatching, setAllMatching] = React.useState(false);

  const visible = columns.filter((c) => !hidden.has(c.id));
  const pageKeys = data.rows.map(rowKey);
  const allOnPage = pageKeys.length > 0 && pageKeys.every((k) => selected.has(k));
  const someOnPage = pageKeys.some((k) => selected.has(k));

  function toggleAllOnPage() {
    const next = new Set(selected);
    if (allOnPage) {
      pageKeys.forEach((k) => next.delete(k));
      setAllMatching(false);
    } else {
      pageKeys.forEach((k) => next.add(k));
    }
    setSelected(next);
  }

  function toggleRow(key: string) {
    const next = new Set(selected);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setSelected(next);
    setAllMatching(false);
  }

  function toggleSort(field: string) {
    const existing = query.sort[0];
    const dir = existing?.field === field && existing.dir === "asc" ? "desc" : "asc";
    onQueryChange({ ...query, sort: [{ field, dir }], page: 1 });
  }

  const totalPages = Math.max(1, Math.ceil(data.total / data.pageSize));
  const from = data.total === 0 ? 0 : (data.page - 1) * data.pageSize + 1;
  const to = Math.min(data.page * data.pageSize, data.total);
  const selectedCount = allMatching ? data.total : selected.size;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between gap-3 border-b border-hairline px-6 py-2">
        <span className="text-xs text-ink-muted">
          <span className="tnum font-medium text-ink">{data.total.toLocaleString()}</span>{" "}
          {data.total === 1 ? "record" : "records"}
        </span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm">
              <Columns3 />
              Columns
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Visible columns</DropdownMenuLabel>
            {columns.map((c) => (
              <DropdownMenuCheckboxItem
                key={c.id}
                checked={!hidden.has(c.id)}
                onCheckedChange={(on) => {
                  const next = new Set(hidden);
                  if (on) next.delete(c.id);
                  else next.add(c.id);
                  setHidden(next);
                }}
              >
                {c.header}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {selected.size > 0 ? (
        <div className="flex flex-wrap items-center gap-3 border-b border-accent/20 bg-accent-soft px-6 py-2">
          <span className="text-xs font-medium text-ink">{selectedCount.toLocaleString()} selected</span>
          {!allMatching && selected.size >= pageKeys.length && data.total > pageKeys.length ? (
            <button
              type="button"
              onClick={() => setAllMatching(true)}
              className="text-xs font-medium text-accent underline underline-offset-2"
            >
              Select all {data.total.toLocaleString()} matching this filter
            </button>
          ) : null}
          <div className="ml-auto flex items-center gap-2">
            {bulkActions?.({ selectedCount, allMatching })}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSelected(new Set());
                setAllMatching(false);
              }}
            >
              Clear
            </Button>
          </div>
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-auto">
        {data.rows.length === 0 ? (
          <EmptyState icon={Inbox} title={emptyTitle} description={emptyDescription} />
        ) : (
          <table className="w-full border-collapse text-sm">
            <thead className="sticky top-0 z-10">
              <tr className="border-b border-hairline bg-surface-sunken">
                <th className="w-10 px-6 py-0 text-left">
                  <Checkbox
                    checked={allOnPage ? true : someOnPage ? "indeterminate" : false}
                    onCheckedChange={toggleAllOnPage}
                    aria-label="Select all rows on this page"
                  />
                </th>
                {visible.map((c) => {
                  const active = query.sort[0]?.field === c.sortField;
                  return (
                    <th
                      key={c.id}
                      style={{ width: c.width }}
                      className={cn(
                        "whitespace-nowrap px-3 py-2 text-2xs font-semibold uppercase tracking-wide text-ink-subtle",
                        c.align === "right" ? "text-right" : "text-left"
                      )}
                    >
                      {c.sortField ? (
                        <button
                          type="button"
                          onClick={() => toggleSort(String(c.sortField))}
                          className={cn(
                            "inline-flex items-center gap-1 transition-colors hover:text-ink",
                            active && "text-ink"
                          )}
                        >
                          {c.header}
                          {active ? (
                            query.sort[0].dir === "asc" ? (
                              <ArrowUp className="size-3" />
                            ) : (
                              <ArrowDown className="size-3" />
                            )
                          ) : (
                            <ChevronsUpDown className="size-3 opacity-40" />
                          )}
                        </button>
                      ) : (
                        c.header
                      )}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row) => {
                const key = rowKey(row);
                const isSelected = allMatching || selected.has(key);
                return (
                  <tr
                    key={key}
                    onClick={() => onRowClick?.(row)}
                    className={cn(
                      "h-row border-b border-hairline transition-colors",
                      onRowClick && "cursor-pointer",
                      isSelected ? "bg-accent-soft" : "bg-surface hover:bg-surface-sunken"
                    )}
                  >
                    <td className="px-6" onClick={(e) => e.stopPropagation()}>
                      <Checkbox checked={isSelected} onCheckedChange={() => toggleRow(key)} aria-label="Select row" />
                    </td>
                    {visible.map((c) => (
                      <td
                        key={c.id}
                        className={cn("px-3 text-ink", c.align === "right" ? "text-right" : "text-left")}
                      >
                        {c.cell(row)}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-hairline bg-surface px-6 py-2">
        <span className="tnum text-xs text-ink-muted">
          {from}-{to} of {data.total.toLocaleString()}
        </span>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            disabled={data.page <= 1}
            onClick={() => onQueryChange({ ...query, page: data.page - 1 })}
          >
            Previous
          </Button>
          <span className="tnum px-2 text-xs text-ink-muted">
            {data.page} / {totalPages}
          </span>
          <Button
            variant="ghost"
            size="sm"
            disabled={data.page >= totalPages}
            onClick={() => onQueryChange({ ...query, page: data.page + 1 })}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}
