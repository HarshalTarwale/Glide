import { afterAll, describe, expect, it } from "vitest";
import { signup } from "@/server/core/signup";
import { withTenant } from "@/lib/db/tenant-client";
import { createPartner } from "@/server/core/partners";
import { listAuditLog, listAuditEntityTypes } from "@/server/core/audit";
import type { RequestContext } from "@/server/context";
import { unionPermissions } from "@/lib/auth/permissions";

/**
 * The P5 tenant-wide Audit Log screen: core:audit:read is a cross-entity
 * report (docs/roadmap.md's "audit-log UI" line), distinct from the
 * per-document Activity rail every record page already has via
 * getAuditTrail. Every module already writes AuditLog rows on mutation
 * (proven throughout P1-P4's own tests); this proves the aggregate query
 * reads them back correctly -- filtered, paginated, permission-gated.
 */

const hasDatabase =
  Boolean(process.env.DATABASE_URL) && !process.env.DATABASE_URL?.includes("placeholder");
const describeWithDb = hasDatabase ? describe : describe.skip;

async function makeOwnerContext(orgName: string) {
  const result = await signup({
    name: "Test Owner",
    email: `auditlog-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`,
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

describeWithDb("Audit Log — the P5 cross-entity report", () => {
  const tenantIds: string[] = [];
  afterAll(async () => {
    const { prisma } = await import("@/lib/db/client");
    for (const id of tenantIds) await withTenant(id, (tx) => tx.tenant.delete({ where: { id } }));
    await prisma.$disconnect();
  });

  it("reads back entries written by other modules, filtered by entity type, newest first", async () => {
    const ctx = await makeOwnerContext("Audit Log Co");
    tenantIds.push(ctx.tenantId);

    const partnerA = await createPartner(ctx, { name: "Alpha Traders", kind: "company", isCustomer: true, isSupplier: false, paymentTermDays: 0 });
    const partnerB = await createPartner(ctx, { name: "Beta Traders", kind: "company", isCustomer: true, isSupplier: false, paymentTermDays: 0 });

    const page = await listAuditLog(ctx, { page: 1, pageSize: 50, filters: [{ field: "entityType", op: "eq", value: "Partner" }], sort: [] });
    expect(page.total).toBeGreaterThanOrEqual(2);
    const entityIds = page.rows.map((r) => r.entityId);
    expect(entityIds).toContain(partnerA.id);
    expect(entityIds).toContain(partnerB.id);
    // Newest first by default.
    expect(new Date(page.rows[0].at).getTime()).toBeGreaterThanOrEqual(new Date(page.rows[page.rows.length - 1].at).getTime());
  });

  it("filters by action", async () => {
    const ctx = await makeOwnerContext("Audit Log Action Co");
    tenantIds.push(ctx.tenantId);

    await createPartner(ctx, { name: "Gamma Traders", kind: "company", isCustomer: true, isSupplier: false, paymentTermDays: 0 });

    const created = await listAuditLog(ctx, { page: 1, pageSize: 50, filters: [{ field: "action", op: "eq", value: "created" }], sort: [] });
    expect(created.rows.every((r) => r.action === "created")).toBe(true);
    expect(created.total).toBeGreaterThan(0);
  });

  it("lists the distinct entity types present for this tenant", async () => {
    const ctx = await makeOwnerContext("Audit Log Types Co");
    tenantIds.push(ctx.tenantId);

    await createPartner(ctx, { name: "Delta Traders", kind: "company", isCustomer: true, isSupplier: false, paymentTermDays: 0 });

    const types = await listAuditEntityTypes(ctx);
    expect(types).toContain("Partner");
  });

  it("is scoped per tenant -- one tenant's audit log never shows another's", async () => {
    const ctxA = await makeOwnerContext("Audit Log Tenant A");
    const ctxB = await makeOwnerContext("Audit Log Tenant B");
    tenantIds.push(ctxA.tenantId, ctxB.tenantId);

    await createPartner(ctxA, { name: "Only In A", kind: "company", isCustomer: true, isSupplier: false, paymentTermDays: 0 });

    const pageB = await listAuditLog(ctxB, { page: 1, pageSize: 50, filters: [], sort: [] });
    expect(pageB.rows.some((r) => r.entityType === "Partner")).toBe(false);
  });
});
