-- ============================================================
-- ROW LEVEL SECURITY for the P4 invoicing tables.
--
-- Same pattern as every prior RLS migration: FORCE (not just ENABLE) plus a
-- policy against the transaction-local app.current_tenant_id set by
-- withTenant(). None of these six need the bootstrap escape hatch --
-- reached only after a tenant context already exists.
-- ============================================================

ALTER TABLE "invoice" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "invoice" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "invoice"
  USING ("tenantId" = app_current_tenant())
  WITH CHECK ("tenantId" = app_current_tenant());

ALTER TABLE "invoice_line" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "invoice_line" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "invoice_line"
  USING ("tenantId" = app_current_tenant())
  WITH CHECK ("tenantId" = app_current_tenant());

ALTER TABLE "credit_note" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "credit_note" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "credit_note"
  USING ("tenantId" = app_current_tenant())
  WITH CHECK ("tenantId" = app_current_tenant());

ALTER TABLE "credit_note_line" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "credit_note_line" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "credit_note_line"
  USING ("tenantId" = app_current_tenant())
  WITH CHECK ("tenantId" = app_current_tenant());

ALTER TABLE "payment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "payment" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "payment"
  USING ("tenantId" = app_current_tenant())
  WITH CHECK ("tenantId" = app_current_tenant());

ALTER TABLE "payment_allocation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "payment_allocation" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "payment_allocation"
  USING ("tenantId" = app_current_tenant())
  WITH CHECK ("tenantId" = app_current_tenant());
