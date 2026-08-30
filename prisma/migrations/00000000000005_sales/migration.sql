-- CreateEnum
CREATE TYPE "SalesOrderStatus" AS ENUM ('draft', 'confirmed', 'partially_delivered', 'delivered', 'invoiced', 'cancelled');

-- CreateEnum
CREATE TYPE "InvoicingPolicy" AS ENUM ('invoice_ordered', 'invoice_delivered');

-- CreateTable
CREATE TABLE "sales_order" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "partnerId" UUID NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "status" "SalesOrderStatus" NOT NULL DEFAULT 'draft',
    "invoicingPolicy" "InvoicingPolicy" NOT NULL DEFAULT 'invoice_delivered',
    "warehouseId" UUID NOT NULL,
    "priceListId" UUID,
    "orderDate" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expectedDeliveryDate" DATE,
    "salespersonId" UUID,
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

    CONSTRAINT "sales_order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_order_line" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "salesOrderId" UUID NOT NULL,
    "sequence" INTEGER NOT NULL,
    "productId" UUID NOT NULL,
    "description" TEXT NOT NULL,
    "uomId" UUID NOT NULL,
    "qtyOrdered" DECIMAL(19,6) NOT NULL,
    "qtyDelivered" DECIMAL(19,6) NOT NULL DEFAULT 0,
    "qtyInvoiced" DECIMAL(19,6) NOT NULL DEFAULT 0,
    "unitPrice" DECIMAL(19,4) NOT NULL,
    "discountPct" DECIMAL(9,4) NOT NULL DEFAULT 0,
    "taxCategoryId" UUID,
    "subtotal" DECIMAL(19,4) NOT NULL,
    "taxAmount" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "total" DECIMAL(19,4) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sales_order_line_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delivery" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "salesOrderId" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "deliveryDate" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" UUID,

    CONSTRAINT "delivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delivery_line" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "deliveryId" UUID NOT NULL,
    "salesOrderLineId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "quantity" DECIMAL(19,6) NOT NULL,
    "stockMoveId" UUID NOT NULL,

    CONSTRAINT "delivery_line_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sales_order_tenantId_status_idx" ON "sales_order"("tenantId", "status");

-- CreateIndex
CREATE INDEX "sales_order_tenantId_partnerId_idx" ON "sales_order"("tenantId", "partnerId");

-- CreateIndex
CREATE UNIQUE INDEX "sales_order_tenantId_number_key" ON "sales_order"("tenantId", "number");

-- CreateIndex
CREATE INDEX "sales_order_line_tenantId_salesOrderId_idx" ON "sales_order_line"("tenantId", "salesOrderId");

-- CreateIndex
CREATE INDEX "delivery_tenantId_salesOrderId_idx" ON "delivery"("tenantId", "salesOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "delivery_tenantId_number_key" ON "delivery"("tenantId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "delivery_line_stockMoveId_key" ON "delivery_line"("stockMoveId");

-- CreateIndex
CREATE INDEX "delivery_line_tenantId_deliveryId_idx" ON "delivery_line"("tenantId", "deliveryId");

-- CreateIndex
CREATE INDEX "delivery_line_tenantId_salesOrderLineId_idx" ON "delivery_line"("tenantId", "salesOrderLineId");

-- AddForeignKey
ALTER TABLE "sales_order" ADD CONSTRAINT "sales_order_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "partner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_order" ADD CONSTRAINT "sales_order_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_order" ADD CONSTRAINT "sales_order_priceListId_fkey" FOREIGN KEY ("priceListId") REFERENCES "price_list"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_order_line" ADD CONSTRAINT "sales_order_line_salesOrderId_fkey" FOREIGN KEY ("salesOrderId") REFERENCES "sales_order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_order_line" ADD CONSTRAINT "sales_order_line_productId_fkey" FOREIGN KEY ("productId") REFERENCES "product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_order_line" ADD CONSTRAINT "sales_order_line_uomId_fkey" FOREIGN KEY ("uomId") REFERENCES "unit_of_measure"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_order_line" ADD CONSTRAINT "sales_order_line_taxCategoryId_fkey" FOREIGN KEY ("taxCategoryId") REFERENCES "tax_category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery" ADD CONSTRAINT "delivery_salesOrderId_fkey" FOREIGN KEY ("salesOrderId") REFERENCES "sales_order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_line" ADD CONSTRAINT "delivery_line_deliveryId_fkey" FOREIGN KEY ("deliveryId") REFERENCES "delivery"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_line" ADD CONSTRAINT "delivery_line_salesOrderLineId_fkey" FOREIGN KEY ("salesOrderLineId") REFERENCES "sales_order_line"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_line" ADD CONSTRAINT "delivery_line_productId_fkey" FOREIGN KEY ("productId") REFERENCES "product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_line" ADD CONSTRAINT "delivery_line_stockMoveId_fkey" FOREIGN KEY ("stockMoveId") REFERENCES "stock_move"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

