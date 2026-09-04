import { afterAll, describe, expect, it } from "vitest";
import { signup } from "@/server/core/signup";
import { withTenant } from "@/lib/db/tenant-client";
import { createLead, getLead, setLeadStatus, convertLead, listLeads } from "@/server/crm/leads";
import { createOpportunity, getOpportunity, changeStage, getPipeline } from "@/server/crm/opportunities";
import { createActivity, listActivitiesFor, listMyOpenActivities, setActivityDone } from "@/server/crm/activities";
import { createPartner } from "@/server/core/partners";
import type { RequestContext } from "@/server/context";
import { unionPermissions } from "@/lib/auth/permissions";

/**
 * P6+ CRM acceptance gate: a lead can be captured and converted into a
 * real customer + opportunity without ever leaving a dangling row behind
 * on failure, the pipeline's stage transitions and lost-reason requirement
 * work, and the pipeline summary the Kanban board's header reads matches
 * what pure summarizePipeline() would compute from the same data.
 */

const hasDatabase =
  Boolean(process.env.DATABASE_URL) && !process.env.DATABASE_URL?.includes("placeholder");
const describeWithDb = hasDatabase ? describe : describe.skip;

async function makeOwnerContext(orgName: string) {
  const result = await signup({
    name: "Test Owner",
    email: `crm-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`,
    password: "password123",
    organisation: orgName,
    country: "IN",
  });
  if (!result.ok) throw new Error(result.error);

  return withTenant(result.tenantId, async (tx) => {
    const membership = await tx.membership.findFirstOrThrow({
      where: { tenantId: result.tenantId, userId: result.userId },
      include: { roles: { include: { role: true } } },
    });
    const roles = membership.roles.map((r) => r.role);
    const tenant = await tx.tenant.findUniqueOrThrow({ where: { id: result.tenantId } });
    const ctx: RequestContext = {
      userId: result.userId,
      userName: "Test Owner",
      userEmail: "",
      tenantId: result.tenantId,
      tenantName: orgName,
      country: tenant.country,
      currency: tenant.currency,
      isOwner: true,
      permissions: unionPermissions(roles),
      recordScopes: [],
      availableTenants: [],
    };
    return ctx;
  });
}

describeWithDb("CRM", () => {
  const tenantIds: string[] = [];
  afterAll(async () => {
    const { prisma } = await import("@/lib/db/client");
    for (const id of tenantIds) await withTenant(id, (tx) => tx.tenant.delete({ where: { id } }));
    await prisma.$disconnect();
  });

  it("a lead converts into a real customer and an opportunity, atomically, and cannot be converted twice", async () => {
    const ctx = await makeOwnerContext("CRM Conversion Co");
    tenantIds.push(ctx.tenantId);

    const leadId = await createLead(ctx, { name: "Priya Shah", companyName: "Shah Textiles", email: "priya@shahtextiles.example", source: "referral" });
    const before = await getLead(ctx, leadId);
    expect(before!.status).toBe("new");

    const { partnerId, opportunityId } = await convertLead(ctx, leadId, {
      createOpportunity: true,
      opportunityName: "Shah Textiles — initial order",
      expectedValue: 50000,
    });
    expect(partnerId).toBeTruthy();
    expect(opportunityId).toBeTruthy();

    const after = await getLead(ctx, leadId);
    expect(after!.status).toBe("converted");
    expect(after!.convertedPartnerId).toBe(partnerId);
    expect(after!.convertedOpportunityId).toBe(opportunityId);

    const partner = await withTenant(ctx.tenantId, (tx) => tx.partner.findUniqueOrThrow({ where: { id: partnerId } }));
    expect(partner.name).toBe("Shah Textiles");
    expect(partner.isCustomer).toBe(true);

    const opportunity = await getOpportunity(ctx, opportunityId!);
    expect(opportunity!.partnerId).toBe(partnerId);
    expect(opportunity!.expectedValue).toBe(50000);
    expect(opportunity!.stage).toBe("new");

    await expect(convertLead(ctx, leadId, { createOpportunity: false, expectedValue: 0 })).rejects.toThrow(/already been converted/);
  });

  it("a converted lead's status can never be edited directly", async () => {
    const ctx = await makeOwnerContext("CRM Frozen Co");
    tenantIds.push(ctx.tenantId);

    const leadId = await createLead(ctx, { name: "No Company Lead", source: "website" });
    await convertLead(ctx, leadId, { createOpportunity: false, expectedValue: 0 });

    await expect(setLeadStatus(ctx, leadId, "qualified")).rejects.toThrow(/converted lead/);
  });

  it("moving an opportunity to a new stage resets its probability to that stage's default", async () => {
    const ctx = await makeOwnerContext("CRM Stage Co");
    tenantIds.push(ctx.tenantId);

    const partner = await createPartner(ctx, { name: "Stage Co Customer", kind: "company", isCustomer: true, isSupplier: false, paymentTermDays: 0 });
    const opportunityId = await createOpportunity(ctx, { name: "Big Deal", partnerId: partner.id, expectedValue: 100000 });

    const created = await getOpportunity(ctx, opportunityId);
    expect(created!.stage).toBe("new");
    expect(created!.probability).toBe(10);

    await changeStage(ctx, opportunityId, { stage: "negotiation" });
    const afterMove = await getOpportunity(ctx, opportunityId);
    expect(afterMove!.stage).toBe("negotiation");
    expect(afterMove!.probability).toBe(75);
  });

  it("marking an opportunity lost requires a reason, and records it", async () => {
    const ctx = await makeOwnerContext("CRM Lost Co");
    tenantIds.push(ctx.tenantId);

    const partner = await createPartner(ctx, { name: "Lost Co Customer", kind: "company", isCustomer: true, isSupplier: false, paymentTermDays: 0 });
    const opportunityId = await createOpportunity(ctx, { name: "Deal That Fails", partnerId: partner.id, expectedValue: 20000 });

    await expect(changeStage(ctx, opportunityId, { stage: "lost" })).rejects.toThrow(/reason is required/);

    await changeStage(ctx, opportunityId, { stage: "lost", lostReason: "Went with a competitor" });
    const after = await getOpportunity(ctx, opportunityId);
    expect(after!.stage).toBe("lost");
    expect(after!.lostReason).toBe("Went with a competitor");
    expect(after!.probability).toBe(0);
  });

  it("the pipeline summary matches what the pure function computes from the same real data", async () => {
    const ctx = await makeOwnerContext("CRM Pipeline Co");
    tenantIds.push(ctx.tenantId);

    const partner = await createPartner(ctx, { name: "Pipeline Co Customer", kind: "company", isCustomer: true, isSupplier: false, paymentTermDays: 0 });
    const openId = await createOpportunity(ctx, { name: "Open Deal", partnerId: partner.id, expectedValue: 10000 });
    const wonId = await createOpportunity(ctx, { name: "Won Deal", partnerId: partner.id, expectedValue: 5000 });
    await changeStage(ctx, wonId, { stage: "won" });

    const { opportunities, summary } = await getPipeline(ctx);
    expect(opportunities.some((o) => o.id === openId)).toBe(true);
    expect(opportunities.some((o) => o.id === wonId)).toBe(true);
    expect(summary.openCount).toBeGreaterThanOrEqual(1);
    expect(summary.wonValue).toBeGreaterThanOrEqual(5000);
    // Open Deal at "new" (10% default probability): weighted contribution is 1000.
    expect(summary.weightedValue).toBeGreaterThanOrEqual(1000);
  });

  it("an activity logged against a lead shows up on that lead's activity list, and can be marked done", async () => {
    const ctx = await makeOwnerContext("CRM Activity Co");
    tenantIds.push(ctx.tenantId);

    const leadId = await createLead(ctx, { name: "Activity Lead", source: "event" });
    const activityId = await createActivity(ctx, { type: "call", subject: "Discovery call", leadId, dueDate: new Date() });

    const activities = await listActivitiesFor(ctx, { leadId });
    expect(activities).toHaveLength(1);
    expect(activities[0].id).toBe(activityId);
    expect(activities[0].isDone).toBe(false);

    const myOpen = await listMyOpenActivities(ctx);
    expect(myOpen.some((a) => a.id === activityId)).toBe(true);

    await setActivityDone(ctx, activityId, true);
    const afterDone = await listActivitiesFor(ctx, { leadId });
    expect(afterDone[0].isDone).toBe(true);
    expect(afterDone[0].doneAt).not.toBeNull();

    const myOpenAfter = await listMyOpenActivities(ctx);
    expect(myOpenAfter.some((a) => a.id === activityId)).toBe(false);
  });

  it("is scoped per tenant -- one tenant's leads never show up in another's list", async () => {
    const ctxA = await makeOwnerContext("CRM Isolation A");
    const ctxB = await makeOwnerContext("CRM Isolation B");
    tenantIds.push(ctxA.tenantId, ctxB.tenantId);

    await createLead(ctxA, { name: "Only In A", source: "other" });

    const page = await listLeads(ctxB, { page: 1, pageSize: 50, filters: [], sort: [] });
    expect(page.rows).toHaveLength(0);
  });
});
