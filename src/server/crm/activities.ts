import "server-only";

import { z } from "zod";
import { withTenant } from "@/lib/db/tenant-client";
import { assertPermission } from "@/lib/auth/permissions";
import type { RequestContext } from "@/server/context";

/**
 * Activities — a logged follow-up (call/email/meeting/to-do) against
 * exactly one of a Lead, an Opportunity, or an existing Partner. Not a
 * scheduler (see crm.prisma's header note): due date and done/not-done,
 * nothing else.
 */

export interface ActivityDTO {
  id: string;
  type: string;
  subject: string;
  dueDate: string | null;
  isDone: boolean;
  doneAt: string | null;
  leadId: string | null;
  opportunityId: string | null;
  partnerId: string | null;
  ownerId: string | null;
  ownerName: string | null;
  notes: string | null;
  createdAt: string;
}

const relatedRefinement = (data: { leadId?: string | null; opportunityId?: string | null; partnerId?: string | null }) =>
  [data.leadId, data.opportunityId, data.partnerId].filter(Boolean).length === 1;

export const activityInputSchema = z
  .object({
    type: z.enum(["call", "email", "meeting", "todo"]),
    subject: z.string().min(1, "Subject is required").max(200),
    dueDate: z.coerce.date().nullish(),
    leadId: z.uuid().nullish(),
    opportunityId: z.uuid().nullish(),
    partnerId: z.uuid().nullish(),
    notes: z.string().max(2000).nullish(),
  })
  .refine(relatedRefinement, { message: "An activity must be linked to exactly one lead, opportunity, or contact.", path: ["leadId"] });
export type ActivityInput = z.infer<typeof activityInputSchema>;

function toDTO(row: {
  id: string;
  type: string;
  subject: string;
  dueDate: Date | null;
  isDone: boolean;
  doneAt: Date | null;
  leadId: string | null;
  opportunityId: string | null;
  partnerId: string | null;
  ownerId: string | null;
  notes: string | null;
  createdAt: Date;
}, ownerNames: Map<string, string>): ActivityDTO {
  return {
    id: row.id,
    type: row.type,
    subject: row.subject,
    dueDate: row.dueDate?.toISOString() ?? null,
    isDone: row.isDone,
    doneAt: row.doneAt?.toISOString() ?? null,
    leadId: row.leadId,
    opportunityId: row.opportunityId,
    partnerId: row.partnerId,
    ownerId: row.ownerId,
    ownerName: row.ownerId ? (ownerNames.get(row.ownerId) ?? null) : null,
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Every activity against one specific lead/opportunity/partner, newest first — the record page's Activity tab. */
export async function listActivitiesFor(
  ctx: RequestContext,
  related: { leadId?: string; opportunityId?: string; partnerId?: string }
): Promise<ActivityDTO[]> {
  assertPermission(ctx.permissions, "crm:activity:read");

  return withTenant(ctx.tenantId, async (tx) => {
    const rows = await tx.activity.findMany({
      where: { leadId: related.leadId, opportunityId: related.opportunityId, partnerId: related.partnerId },
      orderBy: [{ isDone: "asc" }, { dueDate: "asc" }],
    });
    const memberships = await tx.membership.findMany({
      where: { userId: { in: [...new Set(rows.map((r) => r.ownerId).filter((x): x is string => !!x))] } },
      include: { user: true },
    });
    const ownerNames = new Map(memberships.map((m) => [m.userId, m.user.name ?? m.user.email]));
    return rows.map((r) => toDTO(r, ownerNames));
  });
}

/** This user's open (not-done) activities, due soonest first — a personal "what's next" list. */
export async function listMyOpenActivities(ctx: RequestContext): Promise<ActivityDTO[]> {
  assertPermission(ctx.permissions, "crm:activity:read");

  return withTenant(ctx.tenantId, async (tx) => {
    const rows = await tx.activity.findMany({
      where: { ownerId: ctx.userId, isDone: false },
      orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
      take: 100,
    });
    const ownerNames = new Map([[ctx.userId, ctx.userName]]);
    return rows.map((r) => toDTO(r, ownerNames));
  });
}

export async function createActivity(ctx: RequestContext, input: ActivityInput): Promise<string> {
  assertPermission(ctx.permissions, "crm:activity:write");
  const data = activityInputSchema.parse(input);

  return withTenant(ctx.tenantId, async (tx) => {
    const activity = await tx.activity.create({
      data: {
        tenantId: ctx.tenantId,
        type: data.type,
        subject: data.subject,
        dueDate: data.dueDate ?? null,
        leadId: data.leadId || null,
        opportunityId: data.opportunityId || null,
        partnerId: data.partnerId || null,
        ownerId: ctx.userId,
        notes: data.notes || null,
        createdBy: ctx.userId,
      },
    });
    return activity.id;
  });
}

export async function setActivityDone(ctx: RequestContext, activityId: string, isDone: boolean): Promise<void> {
  assertPermission(ctx.permissions, "crm:activity:write");
  await withTenant(ctx.tenantId, async (tx) => {
    await tx.activity.update({ where: { id: activityId }, data: { isDone, doneAt: isDone ? new Date() : null } });
  });
}
