-- CreateIndex
CREATE INDEX "credit_note_line_tenantId_invoiceLineId_idx" ON "credit_note_line"("tenantId", "invoiceLineId");

-- CreateIndex
CREATE INDEX "membership_userId_idx" ON "membership"("userId");
