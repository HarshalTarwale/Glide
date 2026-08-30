-- ============================================================
-- ROW LEVEL SECURITY for the P3 sales tables.
--
-- Same pattern as every prior RLS migration: FORCE (not just ENABLE) plus a
-- policy against the transaction-local app.current_tenant_id set by
-- withTenant(). None of these four need the bootstrap escape hatch --
-- reached only after a tenant context already exists.
-- ============================================================

ALTER TABLE "sales_order" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sales_order" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "sales_order"
  USING ("tenantId" = app_current_tenant())
  WITH CHECK ("tenantId" = app_current_tenant());

ALTER TABLE "sales_order_line" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sales_order_line" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "sales_order_line"
  USING ("tenantId" = app_current_tenant())
  WITH CHECK ("tenantId" = app_current_tenant());

ALTER TABLE "delivery" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "delivery" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "delivery"
  USING ("tenantId" = app_current_tenant())
  WITH CHECK ("tenantId" = app_current_tenant());

ALTER TABLE "delivery_line" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "delivery_line" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "delivery_line"
  USING ("tenantId" = app_current_tenant())
  WITH CHECK ("tenantId" = app_current_tenant());
