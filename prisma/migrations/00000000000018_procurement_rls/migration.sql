-- ============================================================
-- ROW LEVEL SECURITY for the P6+ Procurement tables (PurchaseOrder,
-- PurchaseOrderLine, Receipt, ReceiptLine, Bill, BillLine, BillPayment,
-- BillPaymentAllocation).
--
-- Same pattern as every prior RLS migration: FORCE (not just ENABLE) plus a
-- policy against the transaction-local app.current_tenant_id set by
-- withTenant(). None of these eight need a bootstrap escape hatch --
-- reached only after a tenant context already exists.
-- ============================================================

ALTER TABLE "purchase_order" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "purchase_order" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "purchase_order"
  USING ("tenantId" = app_current_tenant())
  WITH CHECK ("tenantId" = app_current_tenant());

ALTER TABLE "purchase_order_line" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "purchase_order_line" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "purchase_order_line"
  USING ("tenantId" = app_current_tenant())
  WITH CHECK ("tenantId" = app_current_tenant());

ALTER TABLE "receipt" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "receipt" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "receipt"
  USING ("tenantId" = app_current_tenant())
  WITH CHECK ("tenantId" = app_current_tenant());

ALTER TABLE "receipt_line" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "receipt_line" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "receipt_line"
  USING ("tenantId" = app_current_tenant())
  WITH CHECK ("tenantId" = app_current_tenant());

ALTER TABLE "bill" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "bill" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "bill"
  USING ("tenantId" = app_current_tenant())
  WITH CHECK ("tenantId" = app_current_tenant());

ALTER TABLE "bill_line" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "bill_line" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "bill_line"
  USING ("tenantId" = app_current_tenant())
  WITH CHECK ("tenantId" = app_current_tenant());

ALTER TABLE "bill_payment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "bill_payment" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "bill_payment"
  USING ("tenantId" = app_current_tenant())
  WITH CHECK ("tenantId" = app_current_tenant());

ALTER TABLE "bill_payment_allocation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "bill_payment_allocation" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "bill_payment_allocation"
  USING ("tenantId" = app_current_tenant())
  WITH CHECK ("tenantId" = app_current_tenant());
