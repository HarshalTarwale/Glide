-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "ProductType" AS ENUM ('goods', 'service');

-- CreateEnum
CREATE TYPE "TrackingMode" AS ENUM ('none', 'lot', 'serial');

-- CreateEnum
CREATE TYPE "LocationKind" AS ENUM ('internal', 'external', 'adjustment', 'transit');

-- CreateEnum
CREATE TYPE "PartnerKind" AS ENUM ('company', 'person');

-- CreateEnum
CREATE TYPE "AddressKind" AS ENUM ('billing', 'shipping', 'other');

-- CreateTable
CREATE TABLE "product_category" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "parentId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "product_category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "unit_of_measure" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'unit',
    "factor" DECIMAL(19,6) NOT NULL DEFAULT 1,
    "isReference" BOOLEAN NOT NULL DEFAULT false,
    "precision" INTEGER NOT NULL DEFAULT 2,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "unit_of_measure_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tax_category" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "key" TEXT NOT NULL DEFAULT 'standard',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tax_category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tax_rate" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "country" CHAR(2) NOT NULL,
    "region" TEXT,
    "rate" DECIMAL(9,4) NOT NULL,
    "taxCategoryId" UUID,
    "level" TEXT NOT NULL DEFAULT 'national',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tax_rate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "type" "ProductType" NOT NULL DEFAULT 'goods',
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "barcode" TEXT,
    "categoryId" UUID,
    "uomId" UUID NOT NULL,
    "purchaseUomId" UUID,
    "salesPrice" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "costPrice" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "taxCategoryId" UUID,
    "hsnCode" TEXT,
    "tracking" "TrackingMode" NOT NULL DEFAULT 'none',
    "reorderPoint" DECIMAL(19,6),
    "isSellable" BOOLEAN NOT NULL DEFAULT true,
    "isPurchasable" BOOLEAN NOT NULL DEFAULT true,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" UUID,
    "updatedBy" UUID,
    "deletedAt" TIMESTAMP(3),
    "customFields" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "price_list" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "validFrom" DATE,
    "validTo" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "price_list_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "price_list_item" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "priceListId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "minQty" DECIMAL(19,6) NOT NULL DEFAULT 0,
    "price" DECIMAL(19,4) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "price_list_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "country" TEXT NOT NULL DEFAULT 'IN',
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "timeZone" TEXT NOT NULL DEFAULT 'Asia/Kolkata',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "tenant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "legalName" TEXT,
    "country" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "taxId" TEXT,
    "addressLine1" TEXT,
    "addressLine2" TEXT,
    "city" TEXT,
    "region" TEXT,
    "postalCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" UUID,
    "updatedBy" UUID,
    "deletedAt" TIMESTAMP(3),
    "customFields" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "passwordHash" TEXT,
    "emailVerified" TIMESTAMP(3),
    "image" TEXT,
    "density" TEXT NOT NULL DEFAULT 'comfortable',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session" (
    "id" UUID NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification_token" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

-- CreateTable
CREATE TABLE "membership" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "isOwner" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "membership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "permissions" TEXT[],
    "recordScope" TEXT,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "membership_role" (
    "membershipId" UUID NOT NULL,
    "roleId" UUID NOT NULL,

    CONSTRAINT "membership_role_pkey" PRIMARY KEY ("membershipId","roleId")
);

-- CreateTable
CREATE TABLE "invitation" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "roleIds" TEXT[],
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" UUID,

    CONSTRAINT "invitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_key" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "lastUsedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" UUID,

    CONSTRAINT "api_key_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "actorId" UUID,
    "actorName" TEXT NOT NULL,
    "changes" JSONB NOT NULL DEFAULT '{}',
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "number_sequence" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "docType" TEXT NOT NULL,
    "fiscalYear" INTEGER NOT NULL,
    "prefix" TEXT NOT NULL DEFAULT '',
    "padding" INTEGER NOT NULL DEFAULT 4,
    "next" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "number_sequence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attachment" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "storageKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" UUID,

    CONSTRAINT "attachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "saved_view" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "resource" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "query" JSONB NOT NULL,
    "shared" BOOLEAN NOT NULL DEFAULT false,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "ownerId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "saved_view_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "warehouse" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "addressLine1" TEXT,
    "city" TEXT,
    "region" TEXT,
    "postalCode" TEXT,
    "country" CHAR(2),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "warehouse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "location" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "warehouseId" UUID,
    "kind" "LocationKind" NOT NULL DEFAULT 'internal',
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "parentId" UUID,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "location_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "partner" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "kind" "PartnerKind" NOT NULL DEFAULT 'company',
    "code" TEXT,
    "name" TEXT NOT NULL,
    "parentId" UUID,
    "isCustomer" BOOLEAN NOT NULL DEFAULT false,
    "isSupplier" BOOLEAN NOT NULL DEFAULT false,
    "email" TEXT,
    "phone" TEXT,
    "website" TEXT,
    "currency" CHAR(3),
    "priceListId" UUID,
    "paymentTermDays" INTEGER NOT NULL DEFAULT 0,
    "creditLimit" DECIMAL(19,4),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" UUID,
    "updatedBy" UUID,
    "deletedAt" TIMESTAMP(3),
    "customFields" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "partner_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "partner_address" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "partnerId" UUID NOT NULL,
    "kind" "AddressKind" NOT NULL DEFAULT 'billing',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "label" TEXT,
    "line1" TEXT NOT NULL,
    "line2" TEXT,
    "city" TEXT,
    "region" TEXT,
    "regionCode" TEXT,
    "postalCode" TEXT,
    "country" CHAR(2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "partner_address_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "partner_tax_info" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "partnerId" UUID NOT NULL,
    "country" CHAR(2) NOT NULL,
    "taxId" TEXT NOT NULL,
    "region" TEXT,
    "isRegistered" BOOLEAN NOT NULL DEFAULT true,
    "reverseCharge" BOOLEAN NOT NULL DEFAULT false,
    "exemptionCertificate" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "partner_tax_info_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "country" (
    "code" CHAR(2) NOT NULL,
    "name" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "taxRegime" TEXT NOT NULL,
    "taxLabel" TEXT NOT NULL,
    "taxIdLabel" TEXT NOT NULL,
    "regionLabel" TEXT NOT NULL,
    "pricesIncludeTax" BOOLEAN NOT NULL DEFAULT false,
    "timeZone" TEXT NOT NULL,

    CONSTRAINT "country_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "currency" (
    "code" CHAR(3) NOT NULL,
    "name" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "decimals" INTEGER NOT NULL DEFAULT 2,

    CONSTRAINT "currency_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "exchange_rate" (
    "id" UUID NOT NULL,
    "from" CHAR(3) NOT NULL,
    "to" CHAR(3) NOT NULL,
    "rate" DECIMAL(19,8) NOT NULL,
    "asOf" DATE NOT NULL,

    CONSTRAINT "exchange_rate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "product_category_tenantId_idx" ON "product_category"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "product_category_tenantId_name_parentId_key" ON "product_category"("tenantId", "name", "parentId");

-- CreateIndex
CREATE INDEX "unit_of_measure_tenantId_idx" ON "unit_of_measure"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "unit_of_measure_tenantId_code_key" ON "unit_of_measure"("tenantId", "code");

-- CreateIndex
CREATE INDEX "tax_category_tenantId_idx" ON "tax_category"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "tax_category_tenantId_key_key" ON "tax_category"("tenantId", "key");

-- CreateIndex
CREATE INDEX "tax_rate_tenantId_country_region_idx" ON "tax_rate"("tenantId", "country", "region");

-- CreateIndex
CREATE INDEX "product_tenantId_name_idx" ON "product"("tenantId", "name");

-- CreateIndex
CREATE INDEX "product_tenantId_categoryId_idx" ON "product"("tenantId", "categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "product_tenantId_sku_key" ON "product"("tenantId", "sku");

-- CreateIndex
CREATE INDEX "price_list_tenantId_idx" ON "price_list"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "price_list_tenantId_name_key" ON "price_list"("tenantId", "name");

-- CreateIndex
CREATE INDEX "price_list_item_tenantId_priceListId_idx" ON "price_list_item"("tenantId", "priceListId");

-- CreateIndex
CREATE UNIQUE INDEX "price_list_item_priceListId_productId_minQty_key" ON "price_list_item"("priceListId", "productId", "minQty");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_slug_key" ON "tenant"("slug");

-- CreateIndex
CREATE INDEX "company_tenantId_idx" ON "company"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "company_tenantId_name_key" ON "company"("tenantId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "user_email_key" ON "user"("email");

-- CreateIndex
CREATE UNIQUE INDEX "account_provider_providerAccountId_key" ON "account"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "session_sessionToken_key" ON "session"("sessionToken");

-- CreateIndex
CREATE UNIQUE INDEX "verification_token_token_key" ON "verification_token"("token");

-- CreateIndex
CREATE UNIQUE INDEX "verification_token_identifier_token_key" ON "verification_token"("identifier", "token");

-- CreateIndex
CREATE INDEX "membership_tenantId_idx" ON "membership"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "membership_tenantId_userId_key" ON "membership"("tenantId", "userId");

-- CreateIndex
CREATE INDEX "role_tenantId_idx" ON "role"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "role_tenantId_name_key" ON "role"("tenantId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "invitation_token_key" ON "invitation"("token");

-- CreateIndex
CREATE INDEX "invitation_tenantId_idx" ON "invitation"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "invitation_tenantId_email_key" ON "invitation"("tenantId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "api_key_keyHash_key" ON "api_key"("keyHash");

-- CreateIndex
CREATE INDEX "api_key_tenantId_idx" ON "api_key"("tenantId");

-- CreateIndex
CREATE INDEX "audit_log_tenantId_entityType_entityId_idx" ON "audit_log"("tenantId", "entityType", "entityId");

-- CreateIndex
CREATE INDEX "audit_log_tenantId_at_idx" ON "audit_log"("tenantId", "at");

-- CreateIndex
CREATE INDEX "number_sequence_tenantId_idx" ON "number_sequence"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "number_sequence_companyId_docType_fiscalYear_key" ON "number_sequence"("companyId", "docType", "fiscalYear");

-- CreateIndex
CREATE INDEX "attachment_tenantId_entityType_entityId_idx" ON "attachment"("tenantId", "entityType", "entityId");

-- CreateIndex
CREATE INDEX "saved_view_tenantId_resource_idx" ON "saved_view"("tenantId", "resource");

-- CreateIndex
CREATE INDEX "warehouse_tenantId_idx" ON "warehouse"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "warehouse_tenantId_code_key" ON "warehouse"("tenantId", "code");

-- CreateIndex
CREATE INDEX "location_tenantId_warehouseId_idx" ON "location"("tenantId", "warehouseId");

-- CreateIndex
CREATE UNIQUE INDEX "location_tenantId_code_key" ON "location"("tenantId", "code");

-- CreateIndex
CREATE INDEX "partner_tenantId_name_idx" ON "partner"("tenantId", "name");

-- CreateIndex
CREATE INDEX "partner_tenantId_isCustomer_idx" ON "partner"("tenantId", "isCustomer");

-- CreateIndex
CREATE INDEX "partner_tenantId_isSupplier_idx" ON "partner"("tenantId", "isSupplier");

-- CreateIndex
CREATE UNIQUE INDEX "partner_tenantId_code_key" ON "partner"("tenantId", "code");

-- CreateIndex
CREATE INDEX "partner_address_tenantId_partnerId_idx" ON "partner_address"("tenantId", "partnerId");

-- CreateIndex
CREATE INDEX "partner_tax_info_tenantId_partnerId_idx" ON "partner_tax_info"("tenantId", "partnerId");

-- CreateIndex
CREATE UNIQUE INDEX "partner_tax_info_partnerId_country_taxId_key" ON "partner_tax_info"("partnerId", "country", "taxId");

-- CreateIndex
CREATE INDEX "exchange_rate_asOf_idx" ON "exchange_rate"("asOf");

-- CreateIndex
CREATE UNIQUE INDEX "exchange_rate_from_to_asOf_key" ON "exchange_rate"("from", "to", "asOf");

-- AddForeignKey
ALTER TABLE "product_category" ADD CONSTRAINT "product_category_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "product_category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tax_rate" ADD CONSTRAINT "tax_rate_taxCategoryId_fkey" FOREIGN KEY ("taxCategoryId") REFERENCES "tax_category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product" ADD CONSTRAINT "product_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "product_category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product" ADD CONSTRAINT "product_uomId_fkey" FOREIGN KEY ("uomId") REFERENCES "unit_of_measure"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product" ADD CONSTRAINT "product_purchaseUomId_fkey" FOREIGN KEY ("purchaseUomId") REFERENCES "unit_of_measure"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product" ADD CONSTRAINT "product_taxCategoryId_fkey" FOREIGN KEY ("taxCategoryId") REFERENCES "tax_category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_list_item" ADD CONSTRAINT "price_list_item_priceListId_fkey" FOREIGN KEY ("priceListId") REFERENCES "price_list"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_list_item" ADD CONSTRAINT "price_list_item_productId_fkey" FOREIGN KEY ("productId") REFERENCES "product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company" ADD CONSTRAINT "company_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account" ADD CONSTRAINT "account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session" ADD CONSTRAINT "session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership" ADD CONSTRAINT "membership_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership" ADD CONSTRAINT "membership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role" ADD CONSTRAINT "role_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership_role" ADD CONSTRAINT "membership_role_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "membership"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership_role" ADD CONSTRAINT "membership_role_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_key" ADD CONSTRAINT "api_key_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "number_sequence" ADD CONSTRAINT "number_sequence_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "number_sequence" ADD CONSTRAINT "number_sequence_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachment" ADD CONSTRAINT "attachment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_view" ADD CONSTRAINT "saved_view_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_view" ADD CONSTRAINT "saved_view_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "location" ADD CONSTRAINT "location_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "warehouse"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "location" ADD CONSTRAINT "location_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner" ADD CONSTRAINT "partner_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "partner"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner" ADD CONSTRAINT "partner_priceListId_fkey" FOREIGN KEY ("priceListId") REFERENCES "price_list"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_address" ADD CONSTRAINT "partner_address_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "partner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_tax_info" ADD CONSTRAINT "partner_tax_info_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "partner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

