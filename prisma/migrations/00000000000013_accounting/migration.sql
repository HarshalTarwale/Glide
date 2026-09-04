-- CreateEnum
CREATE TYPE "AccountType" AS ENUM ('asset', 'liability', 'equity', 'revenue', 'expense');

-- CreateEnum
CREATE TYPE "JournalEntryStatus" AS ENUM ('draft', 'posted');

-- CreateTable
CREATE TABLE "ledger_account" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "AccountType" NOT NULL,
    "parentId" UUID,
    "systemKey" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ledger_account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "journal_entry" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "description" TEXT NOT NULL,
    "status" "JournalEntryStatus" NOT NULL DEFAULT 'draft',
    "postedAt" TIMESTAMP(3),
    "sourceType" TEXT,
    "sourceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" UUID,

    CONSTRAINT "journal_entry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "journal_entry_line" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "journalEntryId" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "sequence" INTEGER NOT NULL,
    "description" TEXT,
    "debit" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "credit" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "partnerId" UUID,

    CONSTRAINT "journal_entry_line_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ledger_account_tenantId_companyId_idx" ON "ledger_account"("tenantId", "companyId");

-- CreateIndex
CREATE UNIQUE INDEX "ledger_account_tenantId_companyId_code_key" ON "ledger_account"("tenantId", "companyId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "ledger_account_tenantId_companyId_systemKey_key" ON "ledger_account"("tenantId", "companyId", "systemKey");

-- CreateIndex
CREATE INDEX "journal_entry_tenantId_companyId_date_idx" ON "journal_entry"("tenantId", "companyId", "date");

-- CreateIndex
CREATE INDEX "journal_entry_tenantId_status_idx" ON "journal_entry"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "journal_entry_tenantId_number_key" ON "journal_entry"("tenantId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "journal_entry_tenantId_sourceType_sourceId_key" ON "journal_entry"("tenantId", "sourceType", "sourceId");

-- CreateIndex
CREATE INDEX "journal_entry_line_tenantId_journalEntryId_idx" ON "journal_entry_line"("tenantId", "journalEntryId");

-- CreateIndex
CREATE INDEX "journal_entry_line_tenantId_accountId_idx" ON "journal_entry_line"("tenantId", "accountId");

-- CreateIndex
CREATE INDEX "journal_entry_line_tenantId_partnerId_idx" ON "journal_entry_line"("tenantId", "partnerId");

-- AddForeignKey
ALTER TABLE "ledger_account" ADD CONSTRAINT "ledger_account_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "ledger_account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_entry_line" ADD CONSTRAINT "journal_entry_line_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "ledger_account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_entry_line" ADD CONSTRAINT "journal_entry_line_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "journal_entry"("id") ON DELETE CASCADE ON UPDATE CASCADE;
