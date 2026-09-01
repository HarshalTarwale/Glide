import "server-only";

import { withTenant } from "@/lib/db/tenant-client";
import { assertPermission } from "@/lib/auth/permissions";
import { compileQuery } from "@/lib/query/prisma-query";
import type { RecordPage, RecordQuery } from "@/lib/query/record-query";
import type { RequestContext } from "@/server/context";

/**
 * Chatter v1, per Stage 1 research: the field-change audit log, read back.
 * Every service in the app already writes to AuditLog on create/update/
 * confirm/cancel; this is the first shared query for displaying it, used
 * by the sales order record page's Activity rail.
 *
 * Deliberately NOT gated on core:audit:read here: that permission is scoped
 * to SYSTEM_ROLES as "see a cross-entity audit report" (only Accountant and
 * above hold it today), not "see the history of a document I can already
 * open." A Sales Rep viewing their own order must see when it was
 * confirmed. The real gate is the caller already having fetched the parent
 * record (e.g. getSalesOrder, which asserts sales:order:read) before
 * calling this with its id -- a dedicated tenant-wide Audit Log SCREEN,
 * when one exists, is what core:audit:read is for.
 */

export interface AuditEntryDTO {
  id: string;
  action: string;
  actorName: string;
  at: string;
}

export async function getAuditTrail(
  ctx: RequestContext,
  entityType: string,
  entityId: string,
  take = 20
): Promise<AuditEntryDTO[]> {
  return withTenant(ctx.tenantId, async (tx) => {
    const rows = await tx.auditLog.findMany({
      where: { entityType, entityId },
      orderBy: { at: "desc" },
      take,
    });
    return rows.map((r) => ({
      id: r.id,
      action: r.action,
      actorName: r.actorName,
      at: r.at.toISOString(),
    }));
  });
}

/**
 * The tenant-wide screen this.file's header comment names: gated on
 * core:audit:read (a cross-entity report, unlike getAuditTrail above which
 * rides on the caller already having read the one parent record).
 */
export interface AuditLogEntryDTO {
  id: string;
  entityType: string;
  entityId: string;
  action: string;
  actorName: string;
  changes: Record<string, { from: unknown; to: unknown }>;
  at: string;
}

const AUDIT_SEARCH_FIELDS = ["entityType", "action", "actorName"];
const AUDIT_ALLOWED_FIELDS = ["entityType", "action", "actorName", "at"];

export async function listAuditLog(ctx: RequestContext, query: RecordQuery): Promise<RecordPage<AuditLogEntryDTO>> {
  assertPermission(ctx.permissions, "core:audit:read");

  // compileQuery always appends a stable `id: asc` tiebreaker, so its
  // orderBy is never empty -- an activity log with no caller-specified sort
  // must still default to newest-first here, at the one call site that
  // knows what "default" means for this particular list, rather than
  // compileQuery guessing a per-module default.
  const effectiveQuery = query.sort.length === 0 ? { ...query, sort: [{ field: "at", dir: "desc" as const }] } : query;

  const compiled = compileQuery(effectiveQuery, {
    searchFields: AUDIT_SEARCH_FIELDS,
    allowedFields: AUDIT_ALLOWED_FIELDS,
  });

  return withTenant(ctx.tenantId, async (tx) => {
    const [rows, total] = await Promise.all([
      tx.auditLog.findMany({
        where: compiled.where,
        orderBy: compiled.orderBy,
        skip: compiled.skip,
        take: compiled.take,
      }),
      tx.auditLog.count({ where: compiled.where }),
    ]);

    return {
      rows: rows.map((r) => ({
        id: r.id,
        entityType: r.entityType,
        entityId: r.entityId,
        action: r.action,
        actorName: r.actorName,
        changes: r.changes as Record<string, { from: unknown; to: unknown }>,
        at: r.at.toISOString(),
      })),
      total,
      page: query.page,
      pageSize: compiled.take,
    };
  });
}

/** Distinct entity types seen in this tenant's audit log, for the filter dropdown. */
export async function listAuditEntityTypes(ctx: RequestContext): Promise<string[]> {
  assertPermission(ctx.permissions, "core:audit:read");
  return withTenant(ctx.tenantId, async (tx) => {
    const rows = await tx.auditLog.findMany({ distinct: ["entityType"], select: { entityType: true }, orderBy: { entityType: "asc" } });
    return rows.map((r) => r.entityType);
  });
}
