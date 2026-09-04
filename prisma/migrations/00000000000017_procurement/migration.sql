-- CreateEnum
CREATE TYPE "PurchaseOrderStatus" AS ENUM ('draft', 'confirmed', 'partially_received', 'received', 'billed', 'cancelled');

-- CreateEnum
CREATE TYPE "BillingPolicy" AS ENUM ('bill_ordered', 'bill_received');

-- CreateEnum
CREATE TYPE "BillStatus" AS ENUM ('draft', 'posted', 'partially_paid', 'paid', 'cancelled');

-- CreateTable
CREATE TABLE "purchase_order" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "partnerId" UUID NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "status" "PurchaseOrderStatus" NOT NULL DEFAULT 'draft',
    "billingPolicy" "BillingPolicy" NOT NULL DEFAULT 'bill_received',
    "warehouseId" UUID NOT NULL,
    "orderDate" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expectedReceiptDate" DATE,
    "buyerId" UUID,
    "subtotal" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "taxTotal" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "total" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" UUID,
    "updatedBy" UUID,
    "deletedAt" TIMESTAMP(3),
    "customFields" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "purchase_order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_order_line" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "purchaseOrderId" UUID NOT NULL,
    "sequence" INTEGER NOT NULL,
    "productId" UUID NOT NULL,
    "description" TEXT NOT NULL,
    "uomId" UUID NOT NULL,
    "qtyOrdered" DECIMAL(19,6) NOT NULL,
    "qtyReceived" DECIMAL(19,6) NOT NULL DEFAULT 0,
    "qtyBilled" DECIMAL(19,6) NOT NULL DEFAULT 0,
    "unitCost" DECIMAL(19,4) NOT NULL,
    "discountPct" DECIMAL(9,4) NOT NULL DEFAULT 0,
    "taxCategoryId" UUID,
    "subtotal" DECIMAL(19,4) NOT NULL,
    "taxAmount" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "total" DECIMAL(19,4) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "purchase_order_line_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "receipt" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "purchaseOrderId" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "receiptDate" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" UUID,

    CONSTRAINT "receipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "receipt_line" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "receiptId" UUID NOT NULL,
    "purchaseOrderLineId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "quantity" DECIMAL(19,6) NOT NULL,
    "stockMoveId" UUID NOT NULL,

    CONSTRAINT "receipt_line_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bill" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "partnerId" UUID NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "purchaseOrderId" UUID,
    "status" "BillStatus" NOT NULL DEFAULT 'draft',
    "billDate" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueDate" DATE,
    "postedAt" TIMESTAMP(3),
    "subtotal" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "taxTotal" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "total" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "amountPaid" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "taxBreakdown" JSONB,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" UUID,
    "updatedBy" UUID,
    "deletedAt" TIMESTAMP(3),
    "customFields" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "bill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bill_line" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "billId" UUID NOT NULL,
    "sequence" INTEGER NOT NULL,
    "purchaseOrderLineId" UUID,
    "productId" UUID NOT NULL,
    "description" TEXT NOT NULL,
    "uomId" UUID NOT NULL,
    "quantity" DECIMAL(19,6) NOT NULL,
    "unitCost" DECIMAL(19,4) NOT NULL,
    "discountPct" DECIMAL(9,4) NOT NULL DEFAULT 0,
    "taxCategoryId" UUID,
    "subtotal" DECIMAL(19,4) NOT NULL,
    "taxAmount" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "total" DECIMAL(19,4) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bill_line_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bill_payment" (
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

    CONSTRAINT "bill_payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bill_payment_allocation" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "billPaymentId" UUID NOT NULL,
    "billId" UUID NOT NULL,
    "amount" DECIMAL(19,4) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bill_payment_allocation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "purchase_order_tenantId_status_idx" ON "purchase_order"("tenantId", "status");

-- CreateIndex
CREATE INDEX "purchase_order_tenantId_partnerId_idx" ON "purchase_order"("tenantId", "partnerId");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_order_tenantId_number_key" ON "purchase_order"("tenantId", "number");

-- CreateIndex
CREATE INDEX "purchase_order_line_tenantId_purchaseOrderId_idx" ON "purchase_order_line"("tenantId", "purchaseOrderId");

-- CreateIndex
CREATE INDEX "receipt_tenantId_purchaseOrderId_idx" ON "receipt"("tenantId", "purchaseOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "receipt_tenantId_number_key" ON "receipt"("tenantId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "receipt_line_stockMoveId_key" ON "receipt_line"("stockMoveId");

-- CreateIndex
CREATE INDEX "receipt_line_tenantId_receiptId_idx" ON "receipt_line"("tenantId", "receiptId");

-- CreateIndex
CREATE INDEX "receipt_line_tenantId_purchaseOrderLineId_idx" ON "receipt_line"("tenantId", "purchaseOrderLineId");

-- CreateIndex
CREATE INDEX "bill_tenantId_status_idx" ON "bill"("tenantId", "status");

-- CreateIndex
CREATE INDEX "bill_tenantId_partnerId_idx" ON "bill"("tenantId", "partnerId");

-- CreateIndex
CREATE INDEX "bill_tenantId_purchaseOrderId_idx" ON "bill"("tenantId", "purchaseOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "bill_tenantId_number_key" ON "bill"("tenantId", "number");

-- CreateIndex
CREATE INDEX "bill_line_tenantId_billId_idx" ON "bill_line"("tenantId", "billId");

-- CreateIndex
CREATE INDEX "bill_payment_tenantId_partnerId_idx" ON "bill_payment"("tenantId", "partnerId");

-- CreateIndex
CREATE UNIQUE INDEX "bill_payment_tenantId_number_key" ON "bill_payment"("tenantId", "number");

-- CreateIndex
CREATE INDEX "bill_payment_allocation_tenantId_billPaymentId_idx" ON "bill_payment_allocation"("tenantId", "billPaymentId");

-- CreateIndex
CREATE INDEX "bill_payment_allocation_tenantId_billId_idx" ON "bill_payment_allocation"("tenantId", "billId");

-- AddForeignKey
ALTER TABLE "purchase_order" ADD CONSTRAINT "purchase_order_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "partner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order" ADD CONSTRAINT "purchase_order_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_line" ADD CONSTRAINT "purchase_order_line_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "purchase_order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_line" ADD CONSTRAINT "purchase_order_line_productId_fkey" FOREIGN KEY ("productId") REFERENCES "product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_line" ADD CONSTRAINT "purchase_order_line_uomId_fkey" FOREIGN KEY ("uomId") REFERENCES "unit_of_measure"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_line" ADD CONSTRAINT "purchase_order_line_taxCategoryId_fkey" FOREIGN KEY ("taxCategoryId") REFERENCES "tax_category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipt" ADD CONSTRAINT "receipt_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "purchase_order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipt_line" ADD CONSTRAINT "receipt_line_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "receipt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipt_line" ADD CONSTRAINT "receipt_line_purchaseOrderLineId_fkey" FOREIGN KEY ("purchaseOrderLineId") REFERENCES "purchase_order_line"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipt_line" ADD CONSTRAINT "receipt_line_productId_fkey" FOREIGN KEY ("productId") REFERENCES "product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipt_line" ADD CONSTRAINT "receipt_line_stockMoveId_fkey" FOREIGN KEY ("stockMoveId") REFERENCES "stock_move"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bill" ADD CONSTRAINT "bill_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "partner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bill" ADD CONSTRAINT "bill_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "purchase_order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bill_line" ADD CONSTRAINT "bill_line_billId_fkey" FOREIGN KEY ("billId") REFERENCES "bill"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bill_line" ADD CONSTRAINT "bill_line_purchaseOrderLineId_fkey" FOREIGN KEY ("purchaseOrderLineId") REFERENCES "purchase_order_line"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bill_line" ADD CONSTRAINT "bill_line_productId_fkey" FOREIGN KEY ("productId") REFERENCES "product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bill_line" ADD CONSTRAINT "bill_line_uomId_fkey" FOREIGN KEY ("uomId") REFERENCES "unit_of_measure"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bill_line" ADD CONSTRAINT "bill_line_taxCategoryId_fkey" FOREIGN KEY ("taxCategoryId") REFERENCES "tax_category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bill_payment" ADD CONSTRAINT "bill_payment_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "partner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bill_payment_allocation" ADD CONSTRAINT "bill_payment_allocation_billPaymentId_fkey" FOREIGN KEY ("billPaymentId") REFERENCES "bill_payment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bill_payment_allocation" ADD CONSTRAINT "bill_payment_allocation_billId_fkey" FOREIGN KEY ("billId") REFERENCES "bill"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
