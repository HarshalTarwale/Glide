import "server-only";

import { z } from "zod";
import { withTenant, type TenantTransaction } from "@/lib/db/tenant-client";
import { assertPermission, recordScopeWhere } from "@/lib/auth/permissions";
import { compileQuery } from "@/lib/query/prisma-query";
import type { RecordPage, RecordQuery } from "@/lib/query/record-query";
import { DEFAULT_PROBABILITY_BY_STAGE } from "@/lib/crm/pipeline";
import type { RequestContext } from "@/server/context";

/**
 * Lead service. A Lead becomes a Partner (+ usually an Opportunity) on
 * conversion -- see convertLead() below. Deliberately does NOT call
 * createPartner() from core/partners.ts: that function opens its own
 * withTenant() transaction, and nesting one interactive transaction inside
 * another here would mean the Partner could commit on its own connection
 * even if the surrounding conversion later fails -- an orphaned Partner
 * with no Lead pointing at it. convertLead() creates the Partner (and
 * Opportunity) directly inside its own single transaction instead.
 */

export interface LeadDTO {
  id: string;
  name: string;
  companyName: string | null;
  email: string | null;
  phone: string | null;
  source: string;
  status: string;
  ownerId: string | null;
  ownerName: string | null;
  notes: string | null;
  convertedPartnerId: string | null;
  convertedOpportunityId: string | null;
  convertedAt: string | null;
  createdAt: string;
}

const SEARCH_FIELDS = ["name", "companyName", "email"];
const ALLOWED_FIELDS = ["name", "companyName", "status", "source", "createdAt"];

export const leadInputSchema = z.object({
  name: z.string().min(1, "Name is required").max(200),
  companyName: z.string().max(200).nullish(),
  email: z.email("Enter a valid email").nullish().or(z.literal("")),
  phone: z.string().max(32).nullish(),
  source: z.enum(["website", "referral", "cold_outreach", "event", "advertising", "other"]).default("other"),
  notes: z.string().max(2000).nullish(),
});
export type LeadInput = z.infer<typeof leadInputSchema>;

export const convertLeadInputSchema = z.object({
  /** Whether conversion should also open an Opportunity, and its starting details. */
  createOpportunity: z.boolean().default(true),
  opportunityName: z.string().max(200).nullish(),
  expectedValue: z.number().min(0).default(0),
  currency: z.string().length(3).optional(),
  expectedCloseDate: z.coerce.date().nullish(),
});
export type ConvertLeadInput = z.infer<typeof convertLeadInputSchema>;

async function resolveOwnerNames(tx: TenantTransaction, ownerIds: (string | null)[]): Promise<Map<string, string>> {
  const ids = [...new Set(ownerIds.filter((x): x is string => !!x))];
  if (ids.length === 0) return new Map();
  const memberships = await tx.membership.findMany({ where: { userId: { in: ids } }, include: { user: true } });
  return new Map(memberships.map((m) => [m.userId, m.user.name ?? m.user.email]));
}

export async function listLeads(ctx: RequestContext, query: RecordQuery): Promise<RecordPage<LeadDTO>> {
  assertPermission(ctx.permissions, "crm:lead:read");

  const scope = recordScopeWhere(
    ctx.recordScopes.includes("own_records") ? "own_records" : null,
    { userId: ctx.userId, warehouseIds: [] },
    { ownerField: "ownerId" }
  );

  const compiled = compileQuery(query, {
    searchFields: SEARCH_FIELDS,
    allowedFields: ALLOWED_FIELDS,
    scope: { deletedAt: null, ...scope },
  });

  return withTenant(ctx.tenantId, async (tx) => {
    const [rows, total] = await Promise.all([
      tx.lead.findMany({ where: compiled.where, orderBy: compiled.orderBy, skip: compiled.skip, take: compiled.take }),
      tx.lead.count({ where: compiled.where }),
    ]);
    const ownerNames = await resolveOwnerNames(tx, rows.map((r) => r.ownerId));

    return {
      rows: rows.map((r) => toDTO(r, ownerNames)),
      total,
      page: query.page,
      pageSize: compiled.take,
    };
  });
}

export async function getLead(ctx: RequestContext, id: string): Promise<LeadDTO | null> {
  assertPermission(ctx.permissions, "crm:lead:read");
  return withTenant(ctx.tenantId, async (tx) => {
    const row = await tx.lead.findUnique({ where: { id } });
    if (!row) return null;
    const ownerNames = await resolveOwnerNames(tx, [row.ownerId]);
    return toDTO(row, ownerNames);
  });
}

function toDTO(
  row: {
    id: string;
    name: string;
    companyName: string | null;
    email: string | null;
    phone: string | null;
    source: string;
    status: string;
    ownerId: string | null;
    notes: string | null;
    convertedPartnerId: string | null;
    convertedOpportunityId: string | null;
    convertedAt: Date | null;
    createdAt: Date;
  },
  ownerNames: Map<string, string>
): LeadDTO {
  return {
    id: row.id,
    name: row.name,
    companyName: row.companyName,
    email: row.email,
    phone: row.phone,
    source: row.source,
    status: row.status,
    ownerId: row.ownerId,
    ownerName: row.ownerId ? (ownerNames.get(row.ownerId) ?? null) : null,
    notes: row.notes,
    convertedPartnerId: row.convertedPartnerId,
    convertedOpportunityId: row.convertedOpportunityId,
    convertedAt: row.convertedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function createLead(ctx: RequestContext, input: LeadInput): Promise<string> {
  assertPermission(ctx.permissions, "crm:lead:write");
  const data = leadInputSchema.parse(input);

  return withTenant(ctx.tenantId, async (tx) => {
    const lead = await tx.lead.create({
      data: {
        tenantId: ctx.tenantId,
        name: data.name,
        companyName: data.companyName || null,
        email: data.email || null,
        phone: data.phone || null,
        source: data.source,
        ownerId: ctx.userId,
        notes: data.notes || null,
        createdBy: ctx.userId,
        updatedBy: ctx.userId,
      },
    });

    await tx.auditLog.create({
      data: {
        tenantId: ctx.tenantId,
        entityType: "Lead",
        entityId: lead.id,
        action: "created",
        actorId: ctx.userId,
        actorName: ctx.userName,
        changes: { name: { from: null, to: data.name } },
      },
    });

    return lead.id;
  });
}

const setStatusSchema = z.object({ status: z.enum(["new", "contacted", "qualified", "unqualified"]) });

/** Any status short of "converted" -- that one only ever happens via convertLead(), never a plain status edit. */
export async function setLeadStatus(ctx: RequestContext, leadId: string, status: string): Promise<void> {
  assertPermission(ctx.permissions, "crm:lead:write");
  const data = setStatusSchema.parse({ status });

  await withTenant(ctx.tenantId, async (tx) => {
    const lead = await tx.lead.findUniqueOrThrow({ where: { id: leadId } });
    if (lead.status === "converted") {
      throw new Error("A converted lead's status cannot be changed.");
    }
    await tx.lead.update({ where: { id: leadId }, data: { status: data.status, updatedBy: ctx.userId } });
  });
}

/**
 * The one-way transition. Creates a Partner (marked as a customer) from
 * the lead's own fields, optionally an Opportunity against it, and marks
 * the Lead converted -- all inside ONE transaction, so a failure partway
 * through leaves neither a dangling Partner nor a half-converted Lead.
 */
export async function convertLead(ctx: RequestContext, leadId: string, input: ConvertLeadInput): Promise<{ partnerId: string; opportunityId: string | null }> {
  assertPermission(ctx.permissions, "crm:lead:convert");
  const data = convertLeadInputSchema.parse(input);

  return withTenant(ctx.tenantId, async (tx) => {
    const lead = await tx.lead.findUniqueOrThrow({ where: { id: leadId } });
    if (lead.status === "converted") {
      throw new Error("This lead has already been converted.");
    }

    const company = await tx.company.findFirstOrThrow({ where: { tenantId: ctx.tenantId }, orderBy: { createdAt: "asc" } });

    const partner = await tx.partner.create({
      data: {
        tenantId: ctx.tenantId,
        name: lead.companyName || lead.name,
        kind: lead.companyName ? "company" : "person",
        isCustomer: true,
        isSupplier: false,
        email: lead.email,
        phone: lead.phone,
        paymentTermDays: 0,
        notes: lead.notes,
        createdBy: ctx.userId,
        updatedBy: ctx.userId,
      },
    });

    let opportunityId: string | null = null;
    if (data.createOpportunity) {
      const opportunity = await tx.opportunity.create({
        data: {
          tenantId: ctx.tenantId,
          companyId: company.id,
          name: data.opportunityName || `${partner.name} — new business`,
          partnerId: partner.id,
          stage: "new",
          expectedValue: data.expectedValue,
          currency: data.currency ?? company.currency,
          probability: DEFAULT_PROBABILITY_BY_STAGE.new,
          expectedCloseDate: data.expectedCloseDate ?? null,
          ownerId: lead.ownerId ?? ctx.userId,
          createdBy: ctx.userId,
          updatedBy: ctx.userId,
        },
      });
      opportunityId = opportunity.id;
    }

    await tx.lead.update({
      where: { id: leadId },
      data: {
        status: "converted",
        convertedPartnerId: partner.id,
        convertedOpportunityId: opportunityId,
        convertedAt: new Date(),
        updatedBy: ctx.userId,
      },
    });

    await tx.auditLog.create({
      data: {
        tenantId: ctx.tenantId,
        entityType: "Lead",
        entityId: leadId,
        action: "converted",
        actorId: ctx.userId,
        actorName: ctx.userName,
        changes: { partnerId: { from: null, to: partner.id } },
      },
    });

    return { partnerId: partner.id, opportunityId };
  });
}
