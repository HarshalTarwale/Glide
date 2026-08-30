-- CreateEnum
CREATE TYPE "StockMoveType" AS ENUM ('receipt', 'delivery', 'transfer', 'adjustment');

-- CreateTable
CREATE TABLE "lot" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "expiresAt" DATE,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_move" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "type" "StockMoveType" NOT NULL,
    "productId" UUID NOT NULL,
    "fromLocationId" UUID NOT NULL,
    "toLocationId" UUID NOT NULL,
    "lotId" UUID,
    "quantity" DECIMAL(19,6) NOT NULL,
    "unitCost" DECIMAL(19,4) NOT NULL,
    "reference" TEXT,
    "sourceType" TEXT,
    "sourceId" TEXT,
    "movedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" UUID,

    CONSTRAINT "stock_move_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_quant" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "locationId" UUID NOT NULL,
    "lotId" UUID,
    "quantity" DECIMAL(19,6) NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stock_quant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_valuation_layer" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "stockMoveId" UUID NOT NULL,
    "quantity" DECIMAL(19,6) NOT NULL,
    "unitCost" DECIMAL(19,4) NOT NULL,
    "value" DECIMAL(19,4) NOT NULL,
    "balanceQty" DECIMAL(19,6) NOT NULL,
    "balanceValue" DECIMAL(19,4) NOT NULL,
    "movedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_valuation_layer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reorder_rule" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "warehouseId" UUID NOT NULL,
    "minQty" DECIMAL(19,6) NOT NULL,
    "maxQty" DECIMAL(19,6),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reorder_rule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "lot_tenantId_idx" ON "lot"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "lot_tenantId_productId_code_key" ON "lot"("tenantId", "productId", "code");

-- CreateIndex
CREATE INDEX "stock_move_tenantId_productId_movedAt_idx" ON "stock_move"("tenantId", "productId", "movedAt");

-- CreateIndex
CREATE INDEX "stock_move_tenantId_fromLocationId_idx" ON "stock_move"("tenantId", "fromLocationId");

-- CreateIndex
CREATE INDEX "stock_move_tenantId_toLocationId_idx" ON "stock_move"("tenantId", "toLocationId");

-- CreateIndex
CREATE INDEX "stock_quant_tenantId_productId_idx" ON "stock_quant"("tenantId", "productId");

-- CreateIndex
CREATE INDEX "stock_quant_tenantId_locationId_idx" ON "stock_quant"("tenantId", "locationId");

-- CreateIndex
CREATE UNIQUE INDEX "stock_valuation_layer_stockMoveId_key" ON "stock_valuation_layer"("stockMoveId");

-- CreateIndex
CREATE INDEX "stock_valuation_layer_tenantId_productId_movedAt_idx" ON "stock_valuation_layer"("tenantId", "productId", "movedAt");

-- CreateIndex
CREATE INDEX "reorder_rule_tenantId_idx" ON "reorder_rule"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "reorder_rule_tenantId_productId_warehouseId_key" ON "reorder_rule"("tenantId", "productId", "warehouseId");

-- AddForeignKey
ALTER TABLE "lot" ADD CONSTRAINT "lot_productId_fkey" FOREIGN KEY ("productId") REFERENCES "product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_move" ADD CONSTRAINT "stock_move_productId_fkey" FOREIGN KEY ("productId") REFERENCES "product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_move" ADD CONSTRAINT "stock_move_fromLocationId_fkey" FOREIGN KEY ("fromLocationId") REFERENCES "location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_move" ADD CONSTRAINT "stock_move_toLocationId_fkey" FOREIGN KEY ("toLocationId") REFERENCES "location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_move" ADD CONSTRAINT "stock_move_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "lot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_quant" ADD CONSTRAINT "stock_quant_productId_fkey" FOREIGN KEY ("productId") REFERENCES "product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_quant" ADD CONSTRAINT "stock_quant_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_quant" ADD CONSTRAINT "stock_quant_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "lot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_valuation_layer" ADD CONSTRAINT "stock_valuation_layer_productId_fkey" FOREIGN KEY ("productId") REFERENCES "product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_valuation_layer" ADD CONSTRAINT "stock_valuation_layer_stockMoveId_fkey" FOREIGN KEY ("stockMoveId") REFERENCES "stock_move"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reorder_rule" ADD CONSTRAINT "reorder_rule_productId_fkey" FOREIGN KEY ("productId") REFERENCES "product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reorder_rule" ADD CONSTRAINT "reorder_rule_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "warehouse"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ============================================================
-- Partial unique indexes for stock_quant.
--
-- A plain UNIQUE(productId, locationId, lotId) would NOT collapse multiple
-- untracked (lotId IS NULL) rows for the same product+location, because
-- Postgres treats every NULL as distinct from every other NULL in a unique
-- constraint. Two partial indexes express what is actually wanted: exactly
-- one untracked quant row per product+location, and exactly one row per
-- product+location+lot when lot-tracked.
-- ============================================================

CREATE UNIQUE INDEX "stock_quant_untracked_key"
  ON "stock_quant" ("tenantId", "productId", "locationId")
  WHERE "lotId" IS NULL;

CREATE UNIQUE INDEX "stock_quant_lot_key"
  ON "stock_quant" ("tenantId", "productId", "locationId", "lotId")
  WHERE "lotId" IS NOT NULL;
