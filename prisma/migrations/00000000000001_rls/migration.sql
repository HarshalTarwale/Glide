-- ============================================================
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
    SELECT NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
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
    SELECT NULLIF(current_setting('app.current_user_id', true), '')::uuid
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

ALTER TABLE "company" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "company" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "company"
  USING ("tenantId" = app_current_tenant())
  WITH CHECK ("tenantId" = app_current_tenant());

ALTER TABLE "role" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "role" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "role"
  USING ("tenantId" = app_current_tenant())
  WITH CHECK ("tenantId" = app_current_tenant());

ALTER TABLE "invitation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "invitation" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "invitation"
  USING ("tenantId" = app_current_tenant())
  WITH CHECK ("tenantId" = app_current_tenant());

ALTER TABLE "api_key" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "api_key" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "api_key"
  USING ("tenantId" = app_current_tenant())
  WITH CHECK ("tenantId" = app_current_tenant());

ALTER TABLE "audit_log" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audit_log" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "audit_log"
  USING ("tenantId" = app_current_tenant())
  WITH CHECK ("tenantId" = app_current_tenant());

ALTER TABLE "number_sequence" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "number_sequence" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "number_sequence"
  USING ("tenantId" = app_current_tenant())
  WITH CHECK ("tenantId" = app_current_tenant());

ALTER TABLE "attachment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "attachment" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "attachment"
  USING ("tenantId" = app_current_tenant())
  WITH CHECK ("tenantId" = app_current_tenant());

ALTER TABLE "saved_view" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "saved_view" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "saved_view"
  USING ("tenantId" = app_current_tenant())
  WITH CHECK ("tenantId" = app_current_tenant());

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
