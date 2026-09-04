-- CreateEnum
CREATE TYPE "LeadStatus" AS ENUM ('new', 'contacted', 'qualified', 'unqualified', 'converted');

-- CreateEnum
CREATE TYPE "LeadSource" AS ENUM ('website', 'referral', 'cold_outreach', 'event', 'advertising', 'other');

-- CreateEnum
CREATE TYPE "OpportunityStage" AS ENUM ('new', 'qualified', 'proposal', 'negotiation', 'won', 'lost');

-- CreateEnum
CREATE TYPE "ActivityType" AS ENUM ('call', 'email', 'meeting', 'todo');

-- CreateTable
CREATE TABLE "lead" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "companyName" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "source" "LeadSource" NOT NULL DEFAULT 'other',
    "status" "LeadStatus" NOT NULL DEFAULT 'new',
    "ownerId" UUID,
    "notes" TEXT,
    "convertedPartnerId" UUID,
    "convertedOpportunityId" UUID,
    "convertedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" UUID,
    "updatedBy" UUID,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "lead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "opportunity" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "partnerId" UUID NOT NULL,
    "stage" "OpportunityStage" NOT NULL DEFAULT 'new',
    "expectedValue" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "currency" CHAR(3) NOT NULL,
    "probability" INTEGER NOT NULL DEFAULT 0,
    "expectedCloseDate" DATE,
    "ownerId" UUID,
    "lostReason" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" UUID,
    "updatedBy" UUID,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "opportunity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activity" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "type" "ActivityType" NOT NULL,
    "subject" TEXT NOT NULL,
    "dueDate" DATE,
    "isDone" BOOLEAN NOT NULL DEFAULT false,
    "doneAt" TIMESTAMP(3),
    "leadId" UUID,
    "opportunityId" UUID,
    "partnerId" UUID,
    "ownerId" UUID,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" UUID,

    CONSTRAINT "activity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "lead_tenantId_status_idx" ON "lead"("tenantId", "status");

-- CreateIndex
CREATE INDEX "lead_tenantId_ownerId_idx" ON "lead"("tenantId", "ownerId");

-- CreateIndex
CREATE INDEX "opportunity_tenantId_stage_idx" ON "opportunity"("tenantId", "stage");

-- CreateIndex
CREATE INDEX "opportunity_tenantId_partnerId_idx" ON "opportunity"("tenantId", "partnerId");

-- CreateIndex
CREATE INDEX "opportunity_tenantId_ownerId_idx" ON "opportunity"("tenantId", "ownerId");

-- CreateIndex
CREATE INDEX "activity_tenantId_leadId_idx" ON "activity"("tenantId", "leadId");

-- CreateIndex
CREATE INDEX "activity_tenantId_opportunityId_idx" ON "activity"("tenantId", "opportunityId");

-- CreateIndex
CREATE INDEX "activity_tenantId_partnerId_idx" ON "activity"("tenantId", "partnerId");

-- CreateIndex
CREATE INDEX "activity_tenantId_ownerId_isDone_idx" ON "activity"("tenantId", "ownerId", "isDone");

-- AddForeignKey
ALTER TABLE "opportunity" ADD CONSTRAINT "opportunity_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "partner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity" ADD CONSTRAINT "activity_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity" ADD CONSTRAINT "activity_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "opportunity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity" ADD CONSTRAINT "activity_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "partner"("id") ON DELETE CASCADE ON UPDATE CASCADE;
