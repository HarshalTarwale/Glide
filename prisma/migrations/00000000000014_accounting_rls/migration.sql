-- ============================================================
-- ROW LEVEL SECURITY for the Accounting/GL tables.
--
-- Same pattern as every prior RLS migration: FORCE (not just ENABLE) plus a
-- policy against the transaction-local app.current_tenant_id set by
-- withTenant(). None of these three need a bootstrap escape hatch --
-- reached only after a tenant context already exists (the GL subscriber
-- runs after its source document's own withTenant() transaction commits,
-- and opens its own withTenant() call for the same tenant).
-- ============================================================

ALTER TABLE "ledger_account" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ledger_account" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "ledger_account"
  USING ("tenantId" = app_current_tenant())
  WITH CHECK ("tenantId" = app_current_tenant());

ALTER TABLE "journal_entry" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "journal_entry" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "journal_entry"
  USING ("tenantId" = app_current_tenant())
  WITH CHECK ("tenantId" = app_current_tenant());

ALTER TABLE "journal_entry_line" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "journal_entry_line" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "journal_entry_line"
  USING ("tenantId" = app_current_tenant())
  WITH CHECK ("tenantId" = app_current_tenant());
