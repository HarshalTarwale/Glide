import { afterAll, describe, expect, it } from "vitest";
import { signup } from "@/server/core/signup";
import { withTenant } from "@/lib/db/tenant-client";

/**
 * End-to-end verification of the exact signup() service the /signup form
 * calls (src/app/(auth)/signup/actions.ts), against the real Neon database.
 *
 * Requires a real database; skipped otherwise. See tests/rls-isolation.test.ts
 * for the isolation guarantee this flow depends on.
 */

const hasDatabase =
  Boolean(process.env.DATABASE_URL) && !process.env.DATABASE_URL?.includes("placeholder");
const describeWithDb = hasDatabase ? describe : describe.skip;

describeWithDb("signup flow", () => {
  const createdTenants: string[] = [];

  afterAll(async () => {
    const { prisma } = await import("@/lib/db/client");
    for (const id of createdTenants) {
      await withTenant(id, (tx) => tx.tenant.delete({ where: { id } }));
    }
    await prisma.$disconnect();
  });

  it("creates a tenant, company, seeded roles, owner membership and an audit entry", async () => {
    const email = `smoke-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;

    const result = await signup({
      name: "Smoke Test",
      email,
      password: "password123",
      organisation: "Smoke Test Co",
      country: "IN",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    createdTenants.push(result.tenantId);

    const check = await withTenant(result.tenantId, async (tx) => {
      const tenant = await tx.tenant.findUniqueOrThrow({ where: { id: result.tenantId } });
      const company = await tx.company.findFirstOrThrow({ where: { tenantId: result.tenantId } });
      const roles = await tx.role.findMany({ where: { tenantId: result.tenantId } });
      const membership = await tx.membership.findFirstOrThrow({
        where: { tenantId: result.tenantId, userId: result.userId },
        include: { roles: { include: { role: true } } },
      });
      const audit = await tx.auditLog.findMany({ where: { tenantId: result.tenantId } });
      return { tenant, company, roles, membership, audit };
    });

    expect(check.tenant.name).toBe("Smoke Test Co");
    expect(check.tenant.country).toBe("IN");
    expect(check.tenant.currency).toBe("INR");
    expect(check.company.name).toBe("Smoke Test Co");
    // All 7 system roles from permissions.ts are seeded per tenant at signup.
    expect(check.roles).toHaveLength(7);
    expect(check.membership.isOwner).toBe(true);
    expect(check.membership.roles[0]?.role.name).toBe("Owner");
    expect(check.audit).toHaveLength(1);
    expect(check.audit[0].action).toBe("created");
  });

  it("rejects a second signup with the same email", async () => {
    const email = `dup-${Date.now()}@example.com`;
    const first = await signup({
      name: "First",
      email,
      password: "password123",
      organisation: "First Co",
      country: "US",
    });
    expect(first.ok).toBe(true);
    if (first.ok) createdTenants.push(first.tenantId);

    const second = await signup({
      name: "Second",
      email,
      password: "password123",
      organisation: "Second Co",
      country: "US",
    });
    expect(second.ok).toBe(false);
  });

  it("generates the tenant id in application code, so every insert satisfies its own RLS check", async () => {
    // This is the property described in signup.ts: the tenant id is minted
    // BEFORE any row exists, so every INSERT inside withTenant() already
    // satisfies WITH CHECK (tenantId = app_current_tenant()) -- no bypass,
    // no special-case policy, even at the one moment it would be easiest.
    const result = await signup({
      name: "Origin Check",
      email: `origin-${Date.now()}@example.com`,
      password: "password123",
      organisation: "Origin Co",
      country: "GB",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      createdTenants.push(result.tenantId);
      expect(result.tenantId).toMatch(/^[0-9a-f-]{36}$/);
    }
  });
});
