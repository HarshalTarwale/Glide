-- ============================================================
-- ROW LEVEL SECURITY for the P6+ HR tables (Department, Employee,
-- LeaveType, LeaveRequest).
--
-- Same pattern as every prior RLS migration: FORCE (not just ENABLE) plus
-- a policy against the transaction-local app.current_tenant_id set by
-- withTenant(). None of these four need a bootstrap escape hatch -- all
-- reached only after a tenant context already exists.
-- ============================================================

ALTER TABLE "department" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "department" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "department"
  USING ("tenantId" = app_current_tenant())
  WITH CHECK ("tenantId" = app_current_tenant());

ALTER TABLE "employee" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "employee" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "employee"
  USING ("tenantId" = app_current_tenant())
  WITH CHECK ("tenantId" = app_current_tenant());

ALTER TABLE "leave_type" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "leave_type" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "leave_type"
  USING ("tenantId" = app_current_tenant())
  WITH CHECK ("tenantId" = app_current_tenant());

ALTER TABLE "leave_request" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "leave_request" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "leave_request"
  USING ("tenantId" = app_current_tenant())
  WITH CHECK ("tenantId" = app_current_tenant());
