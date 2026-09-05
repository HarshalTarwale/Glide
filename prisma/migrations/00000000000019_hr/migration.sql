-- CreateEnum
CREATE TYPE "EmploymentType" AS ENUM ('full_time', 'part_time', 'contract', 'intern');

-- CreateEnum
CREATE TYPE "EmployeeStatus" AS ENUM ('active', 'on_leave', 'terminated');

-- CreateEnum
CREATE TYPE "LeaveRequestStatus" AS ENUM ('pending', 'approved', 'rejected', 'cancelled');

-- CreateTable
CREATE TABLE "department" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" UUID,
    "updatedBy" UUID,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "department_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "code" TEXT,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "jobTitle" TEXT,
    "departmentId" UUID,
    "reportsToId" UUID,
    "employmentType" "EmploymentType" NOT NULL DEFAULT 'full_time',
    "status" "EmployeeStatus" NOT NULL DEFAULT 'active',
    "dateOfJoining" DATE NOT NULL,
    "dateOfLeaving" DATE,
    "baseSalary" DECIMAL(19,4),
    "currency" CHAR(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" UUID,
    "updatedBy" UUID,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "employee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leave_type" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "defaultAnnualDays" DECIMAL(6,2) NOT NULL,
    "isPaid" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" UUID,
    "updatedBy" UUID,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "leave_type_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leave_request" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "leaveTypeId" UUID NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "days" DECIMAL(6,2) NOT NULL,
    "reason" TEXT,
    "status" "LeaveRequestStatus" NOT NULL DEFAULT 'pending',
    "approvedById" UUID,
    "approvedAt" TIMESTAMP(3),
    "decisionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" UUID,

    CONSTRAINT "leave_request_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "department_tenantId_companyId_name_key" ON "department"("tenantId", "companyId", "name");

-- CreateIndex
CREATE INDEX "employee_tenantId_status_idx" ON "employee"("tenantId", "status");

-- CreateIndex
CREATE INDEX "employee_tenantId_departmentId_idx" ON "employee"("tenantId", "departmentId");

-- CreateIndex
CREATE UNIQUE INDEX "employee_tenantId_code_key" ON "employee"("tenantId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "leave_type_tenantId_companyId_code_key" ON "leave_type"("tenantId", "companyId", "code");

-- CreateIndex
CREATE INDEX "leave_request_tenantId_employeeId_idx" ON "leave_request"("tenantId", "employeeId");

-- CreateIndex
CREATE INDEX "leave_request_tenantId_status_idx" ON "leave_request"("tenantId", "status");

-- AddForeignKey
ALTER TABLE "employee" ADD CONSTRAINT "employee_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee" ADD CONSTRAINT "employee_reportsToId_fkey" FOREIGN KEY ("reportsToId") REFERENCES "employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_request" ADD CONSTRAINT "leave_request_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_request" ADD CONSTRAINT "leave_request_leaveTypeId_fkey" FOREIGN KEY ("leaveTypeId") REFERENCES "leave_type"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
