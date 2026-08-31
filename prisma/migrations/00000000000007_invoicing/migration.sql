-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('draft', 'posted', 'partially_paid', 'paid', 'cancelled');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('bank_transfer', 'card', 'cash', 'cheque', 'other');

-- CreateTable
CREATE TABLE "invoice" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "partnerId" UUID NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "salesOrderId" UUID,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'draft',
    "invoiceDate" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueDate" DATE,
    "postedAt" TIMESTAMP(3),
    "subtotal" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "taxTotal" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "total" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "amountPaid" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" UUID,
    "updatedBy" UUID,
    "deletedAt" TIMESTAMP(3),
    "customFields" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_line" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "invoiceId" UUID NOT NULL,
    "sequence" INTEGER NOT NULL,
    "salesOrderLineId" UUID,
    "productId" UUID NOT NULL,
    "description" TEXT NOT NULL,
    "uomId" UUID NOT NULL,
    "quantity" DECIMAL(19,6) NOT NULL,
    "unitPrice" DECIMAL(19,4) NOT NULL,
    "discountPct" DECIMAL(9,4) NOT NULL DEFAULT 0,
    "taxCategoryId" UUID,
    "subtotal" DECIMAL(19,4) NOT NULL,
    "taxAmount" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "total" DECIMAL(19,4) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "invoice_line_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credit_note" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "invoiceId" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "creditNoteDate" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reason" TEXT NOT NULL,
    "subtotal" DECIMAL(19,4) NOT NULL,
    "taxTotal" DECIMAL(19,4) NOT NULL,
    "total" DECIMAL(19,4) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" UUID,

    CONSTRAINT "credit_note_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credit_note_line" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "creditNoteId" UUID NOT NULL,
    "invoiceLineId" UUID NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(19,6) NOT NULL,
    "unitPrice" DECIMAL(19,4) NOT NULL,
    "subtotal" DECIMAL(19,4) NOT NULL,
    "taxAmount" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "total" DECIMAL(19,4) NOT NULL,

    CONSTRAINT "credit_note_line_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "partnerId" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "paymentDate" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "method" "PaymentMethod" NOT NULL DEFAULT 'bank_transfer',
    "reference" TEXT,
    "amount" DECIMAL(19,4) NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "unallocatedAmount" DECIMAL(19,4) NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" UUID,

    CONSTRAINT "payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_allocation" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "paymentId" UUID NOT NULL,
    "invoiceId" UUID NOT NULL,
    "amount" DECIMAL(19,4) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_allocation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "invoice_tenantId_status_idx" ON "invoice"("tenantId", "status");

-- CreateIndex
CREATE INDEX "invoice_tenantId_partnerId_idx" ON "invoice"("tenantId", "partnerId");

-- CreateIndex
CREATE INDEX "invoice_tenantId_salesOrderId_idx" ON "invoice"("tenantId", "salesOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "invoice_tenantId_number_key" ON "invoice"("tenantId", "number");

-- CreateIndex
CREATE INDEX "invoice_line_tenantId_invoiceId_idx" ON "invoice_line"("tenantId", "invoiceId");

-- CreateIndex
CREATE INDEX "credit_note_tenantId_invoiceId_idx" ON "credit_note"("tenantId", "invoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "credit_note_tenantId_number_key" ON "credit_note"("tenantId", "number");

-- CreateIndex
CREATE INDEX "credit_note_line_tenantId_creditNoteId_idx" ON "credit_note_line"("tenantId", "creditNoteId");

-- CreateIndex
CREATE INDEX "payment_tenantId_partnerId_idx" ON "payment"("tenantId", "partnerId");

-- CreateIndex
CREATE UNIQUE INDEX "payment_tenantId_number_key" ON "payment"("tenantId", "number");

-- CreateIndex
CREATE INDEX "payment_allocation_tenantId_paymentId_idx" ON "payment_allocation"("tenantId", "paymentId");

-- CreateIndex
CREATE INDEX "payment_allocation_tenantId_invoiceId_idx" ON "payment_allocation"("tenantId", "invoiceId");

-- AddForeignKey
ALTER TABLE "invoice" ADD CONSTRAINT "invoice_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "partner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice" ADD CONSTRAINT "invoice_salesOrderId_fkey" FOREIGN KEY ("salesOrderId") REFERENCES "sales_order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_line" ADD CONSTRAINT "invoice_line_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_line" ADD CONSTRAINT "invoice_line_salesOrderLineId_fkey" FOREIGN KEY ("salesOrderLineId") REFERENCES "sales_order_line"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_line" ADD CONSTRAINT "invoice_line_productId_fkey" FOREIGN KEY ("productId") REFERENCES "product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_line" ADD CONSTRAINT "invoice_line_uomId_fkey" FOREIGN KEY ("uomId") REFERENCES "unit_of_measure"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_line" ADD CONSTRAINT "invoice_line_taxCategoryId_fkey" FOREIGN KEY ("taxCategoryId") REFERENCES "tax_category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_note" ADD CONSTRAINT "credit_note_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_note_line" ADD CONSTRAINT "credit_note_line_creditNoteId_fkey" FOREIGN KEY ("creditNoteId") REFERENCES "credit_note"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_note_line" ADD CONSTRAINT "credit_note_line_invoiceLineId_fkey" FOREIGN KEY ("invoiceLineId") REFERENCES "invoice_line"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment" ADD CONSTRAINT "payment_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "partner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_allocation" ADD CONSTRAINT "payment_allocation_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_allocation" ADD CONSTRAINT "payment_allocation_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
