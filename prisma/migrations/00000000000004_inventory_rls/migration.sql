-- ============================================================
-- ROW LEVEL SECURITY for the P2 inventory tables.
--
-- Same pattern as 00000000000001_rls: FORCE (not just ENABLE, since Neon's
-- default role owns these tables and an owner bypasses ENABLE-only RLS) plus
-- a policy against the transaction-local app.current_tenant_id, set by
-- withTenant() before any query. None of these five tables need the
-- bootstrap escape hatch that "tenant" and "membership" do -- they are all
-- reached only after a tenant context already exists.
-- ============================================================

ALTER TABLE "lot" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "lot" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "lot"
  USING ("tenantId" = app_current_tenant())
  WITH CHECK ("tenantId" = app_current_tenant());

ALTER TABLE "stock_move" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "stock_move" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "stock_move"
  USING ("tenantId" = app_current_tenant())
  WITH CHECK ("tenantId" = app_current_tenant());

ALTER TABLE "stock_quant" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "stock_quant" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "stock_quant"
  USING ("tenantId" = app_current_tenant())
  WITH CHECK ("tenantId" = app_current_tenant());

ALTER TABLE "stock_valuation_layer" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "stock_valuation_layer" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "stock_valuation_layer"
  USING ("tenantId" = app_current_tenant())
  WITH CHECK ("tenantId" = app_current_tenant());

ALTER TABLE "reorder_rule" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "reorder_rule" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "reorder_rule"
  USING ("tenantId" = app_current_tenant())
  WITH CHECK ("tenantId" = app_current_tenant());
