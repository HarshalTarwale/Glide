import { afterAll, describe, expect, it } from "vitest";

/**
 * THE P0 ACCEPTANCE GATE (docs/roadmap.md §P0).
 *
 * Everything else in P0 is plumbing for this one guarantee: a session scoped
 * to tenant A must return zero rows when it asks for tenant B's data BY
 * PRIMARY KEY — the strongest form of the question, since there is no WHERE
 * clause left for the application to get wrong.
 *
 * This test also catches the two silent-failure modes that would make RLS
 * decorative rather than real:
 *
 *   1. ENABLE without FORCE. Neon connects as the table owner, and an owner
 *      bypasses ENABLE-only RLS. Every policy would still exist, and none
 *      would apply.
 *   2. Using the neon-http driver instead of the WebSocket one. HTTP cannot do
 *      interactive transactions, so `SET LOCAL` would not survive to the query.
 *
 * Requires a real database. Skipped (loudly) when DATABASE_URL is absent so
 * the suite stays green before Neon is wired up — but it must pass before P0
 * is called done.
 */

const hasDatabase =
  Boolean(process.env.DATABASE_URL) && !process.env.DATABASE_URL?.includes("placeholder");

const describeWithDb = hasDatabase ? describe : describe.skip;

if (!hasDatabase) {
  console.warn(
    "\n  [rls-isolation] SKIPPED — no DATABASE_URL.\n" +
      "  This is the P0 acceptance gate and MUST pass before P0 is complete.\n"
  );
}

describeWithDb("RLS tenant isolation", () => {
  let prisma: typeof import("@/lib/db/client").prisma;
  let withTenant: typeof import("@/lib/db/tenant-client").withTenant;
  const created: string[] = [];

  async function setup() {
    const db = await import("@/lib/db/client");
    const tc = await import("@/lib/db/tenant-client");
    prisma = db.prisma;
    withTenant = tc.withTenant;
  }

  async function makeTenant(name: string) {
    const { randomUUID } = await import("node:crypto");
    const id = randomUUID();
    await withTenant(id, async (tx) => {
      await tx.tenant.create({
        data: { id, name, slug: `${name}-${id.slice(0, 8)}`, country: "IN", currency: "INR" },
      });
      await tx.company.create({
        data: { tenantId: id, name: `${name} Ltd`, country: "IN", currency: "INR" },
      });
    });
    created.push(id);
    return id;
  }

  afterAll(async () => {
    if (!prisma) return;
    for (const id of created) {
      await withTenant(id, (tx) => tx.tenant.delete({ where: { id } }));
    }
    await prisma.$disconnect();
  });

  it("cannot read another tenant's rows, even by primary key", async () => {
    await setup();
    const tenantA = await makeTenant("alpha");
    const tenantB = await makeTenant("beta");

    const bCompanyId = await withTenant(tenantB, async (tx) => {
      const c = await tx.company.findFirstOrThrow({ select: { id: true } });
      return c.id;
    });

    // Tenant A asks for tenant B's company by its exact id. Postgres must
    // refuse — the application never gets the chance to filter.
    const leaked = await withTenant(tenantA, (tx) =>
      tx.company.findUnique({ where: { id: bCompanyId } })
    );

    expect(leaked).toBeNull();
  });

  it("returns zero rows when no tenant context is set (fails closed)", async () => {
    await setup();
    await makeTenant("gamma");

    // current_setting(..., true) is NULL when unset, so `tenantId = NULL` is
    // NULL, which is not true, so no row matches.
    const rows = await prisma.company.findMany();
    expect(rows).toHaveLength(0);
  });

  it("scopes writes too, not only reads", async () => {
    await setup();
    const tenantA = await makeTenant("delta");
    const tenantB = await makeTenant("epsilon");

    const bCompanyId = await withTenant(tenantB, async (tx) => {
      const c = await tx.company.findFirstOrThrow({ select: { id: true } });
      return c.id;
    });

    // An UPDATE from tenant A must affect zero rows rather than silently
    // succeeding — WITH CHECK plus USING covers both directions.
    const result = await withTenant(tenantA, (tx) =>
      tx.company.updateMany({ where: { id: bCompanyId }, data: { name: "hijacked" } })
    );

    expect(result.count).toBe(0);
  });
});
