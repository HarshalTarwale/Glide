import "server-only";

import { z } from "zod";
import { withTenant, type TenantTransaction } from "@/lib/db/tenant-client";
import { assertPermission, recordScopeWhere } from "@/lib/auth/permissions";
import { DEFAULT_PROBABILITY_BY_STAGE, requiresLostReason, summarizePipeline, type OpportunityStage } from "@/lib/crm/pipeline";
import type { RequestContext } from "@/server/context";

/**
 * Opportunity service — the pipeline. Odoo/Zoho teardown (Stage 1
 * research) confirmed a Kanban-by-stage board is the signature CRM screen;
 * getPipeline() returns every open+recent-closed opportunity in one shot
 * specifically so the board can render without N+1 per-column queries.
 */

export interface OpportunityDTO {
  id: string;
  name: string;
  partnerId: string;
  partnerName: string;
  stage: OpportunityStage;
  expectedValue: number;
  currency: string;
  probability: number;
  expectedCloseDate: string | null;
  ownerId: string | null;
  ownerName: string | null;
  lostReason: string | null;
  notes: string | null;
  createdAt: string;
}

export const opportunityInputSchema = z.object({
  name: z.string().min(1, "Name is required").max(200),
  partnerId: z.uuid(),
  expectedValue: z.number().min(0).default(0),
  currency: z.string().length(3).optional(),
  expectedCloseDate: z.coerce.date().nullish(),
  notes: z.string().max(2000).nullish(),
});
export type OpportunityInput = z.infer<typeof opportunityInputSchema>;

const changeStageSchema = z.object({
  stage: z.enum(["new", "qualified", "proposal", "negotiation", "won", "lost"]),
  lostReason: z.string().max(500).nullish(),
});

async function resolveOwnerNames(tx: TenantTransaction, ownerIds: (string | null)[]): Promise<Map<string, string>> {
  const ids = [...new Set(ownerIds.filter((x): x is string => !!x))];
  if (ids.length === 0) return new Map();
  const memberships = await tx.membership.findMany({ where: { userId: { in: ids } }, include: { user: true } });
  return new Map(memberships.map((m) => [m.userId, m.user.name ?? m.user.email]));
}

function toDTO(
  row: {
    id: string;
    name: string;
    partnerId: string;
    partner: { name: string };
    stage: string;
    expectedValue: { toString(): string };
    currency: string;
    probability: number;
    expectedCloseDate: Date | null;
    ownerId: string | null;
    lostReason: string | null;
    notes: string | null;
    createdAt: Date;
  },
  ownerNames: Map<string, string>
): OpportunityDTO {
  return {
    id: row.id,
    name: row.name,
    partnerId: row.partnerId,
    partnerName: row.partner.name,
    stage: row.stage as OpportunityStage,
    expectedValue: Number(row.expectedValue.toString()),
    currency: row.currency,
    probability: row.probability,
    expectedCloseDate: row.expectedCloseDate?.toISOString() ?? null,
    ownerId: row.ownerId,
    ownerName: row.ownerId ? (ownerNames.get(row.ownerId) ?? null) : null,
    lostReason: row.lostReason,
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * Every open opportunity, plus anything closed (won/lost) in the last 30
 * days -- a Kanban board that showed EVERY won/lost deal ever would only
 * grow, never usefully reflect "what's happening now". Older closed deals
 * remain fully visible via listOpportunities()'s filters, just not pinned
 * to the board.
 */
export async function getPipeline(ctx: RequestContext): Promise<{ opportunities: OpportunityDTO[]; summary: ReturnType<typeof summarizePipeline> }> {
  assertPermission(ctx.permissions, "crm:opportunity:read");

  const scope = recordScopeWhere(
    ctx.recordScopes.includes("own_records") ? "own_records" : null,
    { userId: ctx.userId, warehouseIds: [] },
    { ownerField: "ownerId" }
  );

  return withTenant(ctx.tenantId, async (tx) => {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const rows = await tx.opportunity.findMany({
      where: {
        deletedAt: null,
        ...scope,
        OR: [{ stage: { notIn: ["won", "lost"] } }, { updatedAt: { gte: thirtyDaysAgo } }],
      },
      include: { partner: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
    });
    const ownerNames = await resolveOwnerNames(tx, rows.map((r) => r.ownerId));
    const opportunities = rows.map((r) => toDTO(r, ownerNames));

    const summary = summarizePipeline(opportunities.map((o) => ({ stage: o.stage, expectedValue: o.expectedValue, probability: o.probability })));

    return { opportunities, summary };
  });
}

export async function getOpportunity(ctx: RequestContext, id: string): Promise<OpportunityDTO | null> {
  assertPermission(ctx.permissions, "crm:opportunity:read");
  return withTenant(ctx.tenantId, async (tx) => {
    const row = await tx.opportunity.findUnique({ where: { id }, include: { partner: { select: { name: true } } } });
    if (!row) return null;
    const ownerNames = await resolveOwnerNames(tx, [row.ownerId]);
    return toDTO(row, ownerNames);
  });
}

export async function createOpportunity(ctx: RequestContext, input: OpportunityInput): Promise<string> {
  assertPermission(ctx.permissions, "crm:opportunity:write");
  const data = opportunityInputSchema.parse(input);

  return withTenant(ctx.tenantId, async (tx) => {
    const [company, partner] = await Promise.all([
      tx.company.findFirstOrThrow({ where: { tenantId: ctx.tenantId }, orderBy: { createdAt: "asc" } }),
      tx.partner.findUniqueOrThrow({ where: { id: data.partnerId } }),
    ]);

    const opportunity = await tx.opportunity.create({
      data: {
        tenantId: ctx.tenantId,
        companyId: company.id,
        name: data.name,
        partnerId: data.partnerId,
        stage: "new",
        expectedValue: data.expectedValue,
        currency: data.currency ?? partner.currency ?? company.currency,
        probability: DEFAULT_PROBABILITY_BY_STAGE.new,
        expectedCloseDate: data.expectedCloseDate ?? null,
        ownerId: ctx.userId,
        notes: data.notes || null,
        createdBy: ctx.userId,
        updatedBy: ctx.userId,
      },
    });

    await tx.auditLog.create({
      data: {
        tenantId: ctx.tenantId,
        entityType: "Opportunity",
        entityId: opportunity.id,
        action: "created",
        actorId: ctx.userId,
        actorName: ctx.userName,
        changes: { name: { from: null, to: data.name } },
      },
    });

    return opportunity.id;
  });
}

/**
 * Moves an opportunity to a new stage -- the Kanban board's drag-and-drop
 * action. Probability resets to the new stage's default (DEFAULT_PROBABILITY_BY_STAGE)
 * unless the caller is only re-saving the same stage, so dragging a card
 * doesn't silently keep a stale probability from three stages ago.
 */
export async function changeStage(ctx: RequestContext, opportunityId: string, input: { stage: string; lostReason?: string | null }): Promise<void> {
  assertPermission(ctx.permissions, "crm:opportunity:write");
  const data = changeStageSchema.parse(input);

  await withTenant(ctx.tenantId, async (tx) => {
    const opportunity = await tx.opportunity.findUniqueOrThrow({ where: { id: opportunityId } });
    if (requiresLostReason(data.stage) && !data.lostReason) {
      throw new Error("A reason is required when marking an opportunity lost.");
    }

    await tx.opportunity.update({
      where: { id: opportunityId },
      data: {
        stage: data.stage,
        probability: data.stage === opportunity.stage ? opportunity.probability : DEFAULT_PROBABILITY_BY_STAGE[data.stage],
        lostReason: data.stage === "lost" ? data.lostReason : null,
        updatedBy: ctx.userId,
      },
    });

    await tx.auditLog.create({
      data: {
        tenantId: ctx.tenantId,
        entityType: "Opportunity",
        entityId: opportunityId,
        action: "stage_changed",
        actorId: ctx.userId,
        actorName: ctx.userName,
        changes: { stage: { from: opportunity.stage, to: data.stage } },
      },
    });
  });
}
