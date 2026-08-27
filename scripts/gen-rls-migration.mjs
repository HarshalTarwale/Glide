/**
 * Generates the RLS migration from the init migration's actual table list,
 * so the policy set can never drift out of sync with the schema.
 *
 * Re-run after adding tenant-scoped models:
 *   node scripts/gen-rls-migration.mjs <outputDir>
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

const INIT_SQL = "prisma/migrations/00000000000000_init/migration.sql";
const outDir = process.argv[2] ?? "prisma/migrations/00000000000001_rls";

const sql = readFileSync(INIT_SQL, "utf8");
const scoped = [];
const unscoped = [];
const re = /CREATE TABLE "([a-z_]+)" \(([\s\S]*?)\n\);/g;
let m;
while ((m = re.exec(sql))) {
  const [, table, body] = m;
  if (/"tenantId" UUID NOT NULL/.test(body)) scoped.push(table);
  else unscoped.push(table);
}

const q = String.fromCharCode(39); // single quote, kept out of template literals

const header = `-- ============================================================
-- ROW LEVEL SECURITY — tenant isolation.
--
-- Every tenant-scoped table is filtered by the transaction-local setting
-- app.current_tenant_id, which forTenant() in src/lib/db/tenant-client.ts
-- sets before any query runs.
--
-- FORCE ROW LEVEL SECURITY is REQUIRED, not optional. A table owner
-- bypasses ENABLE-only RLS, and Neon connects as the owner. Without FORCE
-- every policy below would silently do nothing — which is exactly the
-- failure mode the P0 isolation test exists to catch.
--
-- current_setting(..., true) returns NULL when unset, so an unscoped query
-- compares against NULL and returns zero rows. The system fails CLOSED.
-- ============================================================

CREATE OR REPLACE FUNCTION app_current_tenant() RETURNS uuid
  LANGUAGE sql STABLE AS $$
    SELECT NULLIF(current_setting(${q}app.current_tenant_id${q}, true), ${q}${q})::uuid
  $$;

-- The BOOTSTRAP identity. Resolving which tenant a user belongs to happens
-- BEFORE a tenant context exists, so tenant-scoped policies alone would
-- deadlock: you cannot read your membership without a tenant, and you cannot
-- know your tenant without reading your membership.
--
-- app_current_user() breaks that cycle. A user may ALWAYS see their own
-- membership rows and the tenants those memberships point at — and nothing
-- else. Everything past that point uses the tenant context normally.
CREATE OR REPLACE FUNCTION app_current_user() RETURNS uuid
  LANGUAGE sql STABLE AS $$
    SELECT NULLIF(current_setting(${q}app.current_user_id${q}, true), ${q}${q})::uuid
  $$;

-- The tenant row: readable via its own id, or by a member during bootstrap.
ALTER TABLE "tenant" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tenant" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "tenant"
  USING (
    "id" = app_current_tenant()
    OR EXISTS (SELECT 1 FROM "membership" m
               WHERE m."tenantId" = "tenant"."id"
                 AND m."userId" = app_current_user())
  )
  WITH CHECK ("id" = app_current_tenant());
`;

// membership is handled separately below: it needs the bootstrap policy.
const body = scoped
  .filter((t) => t !== "membership")
  .map(
    (t) => `
ALTER TABLE "${t}" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "${t}" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "${t}"
  USING ("tenantId" = app_current_tenant())
  WITH CHECK ("tenantId" = app_current_tenant());`
  )
  .join("\n");

const footer = `

-- Membership: tenant-scoped for normal use, PLUS a bootstrap path so a user
-- can always find their own memberships before any tenant context is set.
-- Writes remain strictly tenant-scoped.
ALTER TABLE "membership" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "membership" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "membership"
  USING ("tenantId" = app_current_tenant() OR "userId" = app_current_user())
  WITH CHECK ("tenantId" = app_current_tenant());

-- Join table with no tenantId of its own: inherits scope from membership.
ALTER TABLE "membership_role" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "membership_role" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "membership_role"
  USING (EXISTS (SELECT 1 FROM "membership" m
                 WHERE m."id" = "membership_role"."membershipId"
                   AND m."tenantId" = app_current_tenant()))
  WITH CHECK (EXISTS (SELECT 1 FROM "membership" m
                      WHERE m."id" = "membership_role"."membershipId"
                        AND m."tenantId" = app_current_tenant()));

-- NOT tenant-scoped, deliberately:
--   user, account, session, verification_token
--     One human = one account, potentially across several tenants. Access is
--     ALWAYS mediated through membership in the service layer; no feature
--     queries these tables directly.
--   country, currency, exchange_rate
--     Shared reference data. Every tenant reads the same rows.
`;

mkdirSync(resolve(outDir), { recursive: true });
writeFileSync(resolve(outDir, "migration.sql"), header + body + footer);

console.log(`RLS policies written for ${scoped.length + 2} tables -> ${outDir}/migration.sql`);
console.log(`  scoped by tenantId : ${scoped.join(", ")}`);
console.log(`  no RLS (by design) : ${unscoped.filter((t) => t !== "tenant" && t !== "membership_role").join(", ")}`);
