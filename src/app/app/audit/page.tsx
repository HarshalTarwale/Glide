import { searchParamsToQuery } from "@/lib/query/record-query";
import { requireContext } from "@/server/context";
import { listAuditLog, listAuditEntityTypes } from "@/server/core/audit";
import { AuditLogView } from "./audit-log-view";

export const metadata = { title: "Audit Log" };

/**
 * The tenant-wide screen core:audit:read exists for (see audit.ts's header
 * comment) -- a cross-entity report, not the per-document Activity rail
 * every record page already has. Reads real data only: unlike the module
 * list pages, there is no signed-out demo fallback here -- a fabricated
 * audit history would misrepresent what actually happened, which is the
 * one thing this screen exists to be trustworthy about.
 */
export default async function AuditLogPage({ searchParams }: PageProps<"/app/audit">) {
  const params = await searchParams;
  const sp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string") sp.set(key, value);
    else if (Array.isArray(value) && value[0]) sp.set(key, value[0]);
  }

  const query = searchParamsToQuery(sp);
  const ctx = await requireContext();

  const [page, entityTypes] = await Promise.all([listAuditLog(ctx, query), listAuditEntityTypes(ctx)]);

  return <AuditLogView page={page} query={query} entityTypes={entityTypes} />;
}
