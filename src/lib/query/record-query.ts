/**
 * The shared record-query abstraction.
 *
 * Stage 1 research finding: in Odoo the same model and the same filter
 * state renders as list, kanban, pivot or calendar. That only works if the
 * query layer is separate from the renderer. Filtering, sorting, grouping
 * and pagination live HERE, not inside DataTable -- so adding a kanban or
 * pivot view later costs days instead of months.
 *
 * The same shape is used by:
 *   - the URL (shareable, back-button-safe list views)
 *   - saved views (a named RecordQuery, per user or shared with the team)
 *   - server-side bulk actions (act on the predicate, not on 3,400 row ids)
 */

export type FilterOperator =
  | "eq"
  | "neq"
  | "contains"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "in"
  | "between"
  | "isNull"
  | "notNull";

export interface FilterSpec {
  field: string;
  op: FilterOperator;
  value?: unknown;
  /** Human label shown in the filter chip. */
  label?: string;
}

export interface SortSpec {
  field: string;
  dir: "asc" | "desc";
}

export interface RecordQuery {
  /** Field-scoped search text. */
  search?: string;
  filters: FilterSpec[];
  sort: SortSpec[];
  /** Group rows by any field, producing collapsible sections with aggregates. */
  groupBy?: string;
  page: number;
  pageSize: number;
}

export const EMPTY_QUERY: RecordQuery = {
  search: "",
  filters: [],
  sort: [],
  page: 1,
  pageSize: 50,
};

export interface RecordPage<T> {
  rows: T[];
  /** Total matching the predicate, not the page. Drives "select all matching". */
  total: number;
  page: number;
  pageSize: number;
}

export interface SavedView {
  id: string;
  name: string;
  query: RecordQuery;
  /** Shared with the whole tenant, or private to the creating user. */
  shared: boolean;
  isDefault: boolean;
}

/* ------------------------------------------------------------------ */
/* URL serialisation -- list views must be shareable and back-safe.    */
/* ------------------------------------------------------------------ */

export function queryToSearchParams(q: RecordQuery): URLSearchParams {
  const sp = new URLSearchParams();
  if (q.search) sp.set("q", q.search);
  if (q.filters.length) sp.set("f", JSON.stringify(q.filters));
  if (q.sort.length) sp.set("s", q.sort.map((s) => `${s.dir === "desc" ? "-" : ""}${s.field}`).join(","));
  if (q.groupBy) sp.set("g", q.groupBy);
  if (q.page > 1) sp.set("p", String(q.page));
  if (q.pageSize !== EMPTY_QUERY.pageSize) sp.set("n", String(q.pageSize));
  return sp;
}

export function searchParamsToQuery(sp: URLSearchParams): RecordQuery {
  let filters: FilterSpec[] = [];
  const raw = sp.get("f");
  if (raw) {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) filters = parsed as FilterSpec[];
    } catch {
      filters = [];
    }
  }
  return {
    search: sp.get("q") ?? "",
    filters,
    sort:
      sp
        .get("s")
        ?.split(",")
        .filter(Boolean)
        .map((token) => ({
          field: token.replace(/^-/, ""),
          dir: token.startsWith("-") ? ("desc" as const) : ("asc" as const),
        })) ?? [],
    groupBy: sp.get("g") ?? undefined,
    page: Number(sp.get("p") ?? 1),
    pageSize: Number(sp.get("n") ?? EMPTY_QUERY.pageSize),
  };
}

/* ------------------------------------------------------------------ */
/* Client-side evaluation.                                             */
/* Used for mock data and small in-memory lists. The server implements */
/* the same semantics in SQL, so behaviour matches in both places.     */
/* ------------------------------------------------------------------ */

function getField(row: Record<string, unknown>, field: string): unknown {
  return field.split(".").reduce<unknown>((acc, key) => {
    if (acc && typeof acc === "object") return (acc as Record<string, unknown>)[key];
    return undefined;
  }, row);
}

function matches(row: Record<string, unknown>, f: FilterSpec): boolean {
  const v = getField(row, f.field);
  switch (f.op) {
    case "eq": return v === f.value;
    case "neq": return v !== f.value;
    case "contains": return String(v ?? "").toLowerCase().includes(String(f.value ?? "").toLowerCase());
    case "gt": return Number(v) > Number(f.value);
    case "gte": return Number(v) >= Number(f.value);
    case "lt": return Number(v) < Number(f.value);
    case "lte": return Number(v) <= Number(f.value);
    case "in": return Array.isArray(f.value) && (f.value as unknown[]).includes(v);
    case "between": {
      const [a, b] = (f.value as [number, number]) ?? [0, 0];
      return Number(v) >= a && Number(v) <= b;
    }
    case "isNull": return v === null || v === undefined;
    case "notNull": return v !== null && v !== undefined;
    default: return true;
  }
}

export function runQuery<T extends Record<string, unknown>>(
  rows: T[],
  q: RecordQuery,
  searchFields: string[]
): RecordPage<T> {
  let out = rows;

  if (q.search) {
    const needle = q.search.toLowerCase();
    out = out.filter((r) =>
      searchFields.some((f) => String(getField(r, f) ?? "").toLowerCase().includes(needle))
    );
  }

  for (const f of q.filters) out = out.filter((r) => matches(r, f));

  if (q.sort.length) {
    out = [...out].sort((a, b) => {
      for (const s of q.sort) {
        const av = getField(a, s.field);
        const bv = getField(b, s.field);
        if (av === bv) continue;
        const cmp = (av as number) > (bv as number) ? 1 : -1;
        return s.dir === "desc" ? -cmp : cmp;
      }
      return 0;
    });
  }

  const total = out.length;
  const start = (q.page - 1) * q.pageSize;
  return { rows: out.slice(start, start + q.pageSize), total, page: q.page, pageSize: q.pageSize };
}
