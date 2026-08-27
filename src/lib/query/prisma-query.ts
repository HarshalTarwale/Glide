import type { FilterSpec, RecordQuery, SortSpec } from "./record-query";

/**
 * Compiles a RecordQuery into Prisma arguments.
 *
 * This is the server-side twin of runQuery() in record-query.ts. The same
 * RecordQuery that drives the URL, saved views and the client-side demo
 * evaluator drives the actual SQL — so a saved view behaves identically
 * whether it is evaluated in the browser or the database.
 *
 * Note what this does NOT do: tenant scoping. That is enforced by Postgres
 * RLS via withTenant(), one layer below. A compiler that also had to
 * remember tenant_id would be a compiler that could forget it.
 */

export interface CompiledQuery {
  where: Record<string, unknown>;
  orderBy: Record<string, unknown>[];
  skip: number;
  take: number;
}

export interface CompileOptions {
  /** Fields the free-text search box scans. */
  searchFields: string[];
  /**
   * Whitelist of filterable/sortable field names. Anything outside it is
   * dropped — a RecordQuery arrives from the URL, so it is user input, and
   * an unchecked field name is a path to data the caller should not reach.
   */
  allowedFields: string[];
  /** Extra predicate, e.g. a role's record scope. ANDed with everything. */
  scope?: Record<string, unknown>;
  maxPageSize?: number;
}

/** Turns "a.b" into { a: { b: value } } so relations filter naturally. */
function nest(path: string, value: unknown): Record<string, unknown> {
  const parts = path.split(".");
  return parts.reduceRight<unknown>((acc, key) => ({ [key]: acc }), value) as Record<
    string,
    unknown
  >;
}

function filterToPrisma(filter: FilterSpec): Record<string, unknown> | null {
  const { field, op, value } = filter;

  switch (op) {
    case "eq":
      return nest(field, value);
    case "neq":
      return nest(field, { not: value });
    case "contains":
      return nest(field, { contains: String(value ?? ""), mode: "insensitive" });
    case "gt":
      return nest(field, { gt: value });
    case "gte":
      return nest(field, { gte: value });
    case "lt":
      return nest(field, { lt: value });
    case "lte":
      return nest(field, { lte: value });
    case "in":
      return Array.isArray(value) ? nest(field, { in: value }) : null;
    case "between": {
      if (!Array.isArray(value) || value.length !== 2) return null;
      return nest(field, { gte: value[0], lte: value[1] });
    }
    case "isNull":
      return nest(field, null);
    case "notNull":
      return nest(field, { not: null });
    default:
      return null;
  }
}

function sortToPrisma(sort: SortSpec): Record<string, unknown> {
  return nest(sort.field, sort.dir);
}

export function compileQuery(query: RecordQuery, options: CompileOptions): CompiledQuery {
  const allowed = new Set(options.allowedFields);
  const and: Record<string, unknown>[] = [];

  if (options.scope && Object.keys(options.scope).length > 0) {
    and.push(options.scope);
  }

  const search = query.search?.trim();
  if (search && options.searchFields.length > 0) {
    and.push({
      OR: options.searchFields.map((f) =>
        nest(f, { contains: search, mode: "insensitive" })
      ),
    });
  }

  for (const filter of query.filters) {
    // Silently dropping an unknown field is deliberate: a stale saved view or
    // a hand-edited URL should degrade to a broader result set, never error
    // and never reach a column it was not granted.
    if (!allowed.has(filter.field)) continue;
    const compiled = filterToPrisma(filter);
    if (compiled) and.push(compiled);
  }

  const orderBy = query.sort
    .filter((s) => allowed.has(s.field))
    .map(sortToPrisma);

  // A stable tiebreaker. Without one, two rows with equal sort keys can swap
  // between pages and a user paging through a list sees a record twice while
  // never seeing another.
  orderBy.push({ id: "asc" });

  const maxPageSize = options.maxPageSize ?? 200;
  const take = Math.min(Math.max(1, query.pageSize), maxPageSize);
  const page = Math.max(1, query.page);

  return {
    where: and.length === 0 ? {} : and.length === 1 ? and[0] : { AND: and },
    orderBy,
    skip: (page - 1) * take,
    take,
  };
}
