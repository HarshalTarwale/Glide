-- CreateEnum
CREATE TYPE "WorkOrderStatus" AS ENUM ('draft', 'confirmed', 'done', 'cancelled');

-- AlterEnum
ALTER TYPE "LocationKind" ADD VALUE 'production';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "StockMoveType" ADD VALUE 'consumption';
ALTER TYPE "StockMoveType" ADD VALUE 'production';

-- CreateTable
CREATE TABLE "bill_of_material" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "quantity" DECIMAL(19,6) NOT NULL DEFAULT 1,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" UUID,
    "updatedBy" UUID,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "bill_of_material_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bom_line" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "bomId" UUID NOT NULL,
    "componentProductId" UUID NOT NULL,
    "quantity" DECIMAL(19,6) NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "bom_line_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_order" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "bomId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "warehouseId" UUID NOT NULL,
    "quantity" DECIMAL(19,6) NOT NULL,
    "status" "WorkOrderStatus" NOT NULL DEFAULT 'draft',
    "scheduledDate" DATE,
    "completedAt" TIMESTAMP(3),
    "unitCost" DECIMAL(19,4),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" UUID,
    "updatedBy" UUID,

    CONSTRAINT "work_order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_order_line" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "workOrderId" UUID NOT NULL,
    "componentProductId" UUID NOT NULL,
    "plannedQty" DECIMAL(19,6) NOT NULL,

    CONSTRAINT "work_order_line_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "bill_of_material_tenantId_productId_idx" ON "bill_of_material"("tenantId", "productId");

-- CreateIndex
CREATE INDEX "bom_line_tenantId_bomId_idx" ON "bom_line"("tenantId", "bomId");

-- CreateIndex
CREATE INDEX "work_order_tenantId_status_idx" ON "work_order"("tenantId", "status");

-- CreateIndex
CREATE INDEX "work_order_tenantId_bomId_idx" ON "work_order"("tenantId", "bomId");

-- CreateIndex
CREATE INDEX "work_order_line_tenantId_workOrderId_idx" ON "work_order_line"("tenantId", "workOrderId");

-- AddForeignKey
ALTER TABLE "bill_of_material" ADD CONSTRAINT "bill_of_material_productId_fkey" FOREIGN KEY ("productId") REFERENCES "product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bom_line" ADD CONSTRAINT "bom_line_bomId_fkey" FOREIGN KEY ("bomId") REFERENCES "bill_of_material"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bom_line" ADD CONSTRAINT "bom_line_componentProductId_fkey" FOREIGN KEY ("componentProductId") REFERENCES "product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_order" ADD CONSTRAINT "work_order_bomId_fkey" FOREIGN KEY ("bomId") REFERENCES "bill_of_material"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_order" ADD CONSTRAINT "work_order_productId_fkey" FOREIGN KEY ("productId") REFERENCES "product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_order" ADD CONSTRAINT "work_order_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_order_line" ADD CONSTRAINT "work_order_line_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "work_order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_order_line" ADD CONSTRAINT "work_order_line_componentProductId_fkey" FOREIGN KEY ("componentProductId") REFERENCES "product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
