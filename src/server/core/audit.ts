import "server-only";

import { withTenant } from "@/lib/db/tenant-client";
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
