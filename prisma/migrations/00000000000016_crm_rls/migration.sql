-- ============================================================
-- ROW LEVEL SECURITY for the P6+ CRM tables (Lead, Opportunity, Activity).
--
-- Same pattern as every prior RLS migration: FORCE (not just ENABLE) plus a
-- policy against the transaction-local app.current_tenant_id set by
-- withTenant(). None of these three need a bootstrap escape hatch --
-- reached only after a tenant context already exists.
-- ============================================================

ALTER TABLE "lead" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "lead" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "lead"
  USING ("tenantId" = app_current_tenant())
  WITH CHECK ("tenantId" = app_current_tenant());

ALTER TABLE "opportunity" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "opportunity" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "opportunity"
  USING ("tenantId" = app_current_tenant())
  WITH CHECK ("tenantId" = app_current_tenant());

ALTER TABLE "activity" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "activity" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "activity"
  USING ("tenantId" = app_current_tenant())
  WITH CHECK ("tenantId" = app_current_tenant());
