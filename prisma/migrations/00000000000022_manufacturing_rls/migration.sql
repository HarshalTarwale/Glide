-- ============================================================
-- ROW LEVEL SECURITY for the P6+ Manufacturing tables (BillOfMaterial,
-- BomLine, WorkOrder, WorkOrderLine).
--
-- Same pattern as every prior RLS migration: FORCE (not just ENABLE) plus
-- a policy against the transaction-local app.current_tenant_id set by
-- withTenant(). None of these four need a bootstrap escape hatch -- all
-- reached only after a tenant context already exists.
-- ============================================================

ALTER TABLE "bill_of_material" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "bill_of_material" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "bill_of_material"
  USING ("tenantId" = app_current_tenant())
  WITH CHECK ("tenantId" = app_current_tenant());

ALTER TABLE "bom_line" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "bom_line" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "bom_line"
  USING ("tenantId" = app_current_tenant())
  WITH CHECK ("tenantId" = app_current_tenant());

ALTER TABLE "work_order" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "work_order" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "work_order"
  USING ("tenantId" = app_current_tenant())
  WITH CHECK ("tenantId" = app_current_tenant());

ALTER TABLE "work_order_line" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "work_order_line" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "work_order_line"
  USING ("tenantId" = app_current_tenant())
  WITH CHECK ("tenantId" = app_current_tenant());
