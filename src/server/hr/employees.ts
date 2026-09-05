import "server-only";

import { z } from "zod";
import { withTenant } from "@/lib/db/tenant-client";
import { assertPermission } from "@/lib/auth/permissions";
import { compileQuery } from "@/lib/query/prisma-query";
import type { RecordPage, RecordQuery } from "@/lib/query/record-query";
import type { RequestContext } from "@/server/context";

/**
 * Employee directory. Deliberately NOT linked to a User/login -- see
 * hr.prisma's header note on the self-service portal being a stated v2
 * feature, not built here.
 */

export interface EmployeeDTO {
  id: string;
  code: string | null;
  name: string;
  email: string | null;
  phone: string | null;
  jobTitle: string | null;
  departmentId: string | null;
  departmentName: string | null;
  reportsToId: string | null;
  reportsToName: string | null;
  employmentType: string;
  status: string;
  dateOfJoining: string;
  dateOfLeaving: string | null;
  baseSalary: number | null;
  currency: string | null;
  notes: string | null;
  createdAt: string;
}

const SEARCH_FIELDS = ["name", "code", "email", "jobTitle"];
const ALLOWED_FIELDS = ["name", "code", "status", "employmentType", "dateOfJoining", "createdAt"];

export const employeeInputSchema = z.object({
  code: z.string().max(50).nullish(),
  name: z.string().min(1, "Name is required").max(200),
  email: z.email("Enter a valid email").nullish().or(z.literal("")),
  phone: z.string().max(32).nullish(),
  jobTitle: z.string().max(200).nullish(),
  departmentId: z.uuid().nullish(),
  reportsToId: z.uuid().nullish(),
  employmentType: z.enum(["full_time", "part_time", "contract", "intern"]).default("full_time"),
  dateOfJoining: z.coerce.date(),
  baseSalary: z.number().min(0).nullish(),
  currency: z.string().length(3).nullish(),
  notes: z.string().max(2000).nullish(),
});
export type EmployeeInput = z.infer<typeof employeeInputSchema>;

const statusInputSchema = z.object({
  status: z.enum(["active", "on_leave", "terminated"]),
  dateOfLeaving: z.coerce.date().nullish(),
});

function toDTO(row: {
  id: string;
  code: string | null;
  name: string;
  email: string | null;
  phone: string | null;
  jobTitle: string | null;
  departmentId: string | null;
  department: { name: string } | null;
  reportsToId: string | null;
  reportsTo: { name: string } | null;
  employmentType: string;
  status: string;
  dateOfJoining: Date;
  dateOfLeaving: Date | null;
  baseSalary: { toString(): string } | null;
  currency: string | null;
  notes: string | null;
  createdAt: Date;
}): EmployeeDTO {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    email: row.email,
    phone: row.phone,
    jobTitle: row.jobTitle,
    departmentId: row.departmentId,
    departmentName: row.department?.name ?? null,
    reportsToId: row.reportsToId,
    reportsToName: row.reportsTo?.name ?? null,
    employmentType: row.employmentType,
    status: row.status,
    dateOfJoining: row.dateOfJoining.toISOString(),
    dateOfLeaving: row.dateOfLeaving?.toISOString() ?? null,
    baseSalary: row.baseSalary ? Number(row.baseSalary.toString()) : null,
    currency: row.currency,
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function listEmployees(ctx: RequestContext, query: RecordQuery): Promise<RecordPage<EmployeeDTO>> {
  assertPermission(ctx.permissions, "hr:employee:read");

  const compiled = compileQuery(query, { searchFields: SEARCH_FIELDS, allowedFields: ALLOWED_FIELDS, scope: { deletedAt: null } });

  return withTenant(ctx.tenantId, async (tx) => {
    const [rows, total] = await Promise.all([
      tx.employee.findMany({
        where: compiled.where,
        orderBy: compiled.orderBy,
        skip: compiled.skip,
        take: compiled.take,
        include: { department: { select: { name: true } }, reportsTo: { select: { name: true } } },
      }),
      tx.employee.count({ where: compiled.where }),
    ]);

    return { rows: rows.map(toDTO), total, page: query.page, pageSize: compiled.take };
  });
}

export async function getEmployee(ctx: RequestContext, id: string): Promise<EmployeeDTO | null> {
  assertPermission(ctx.permissions, "hr:employee:read");

  return withTenant(ctx.tenantId, async (tx) => {
    const row = await tx.employee.findUnique({
      where: { id },
      include: { department: { select: { name: true } }, reportsTo: { select: { name: true } } },
    });
    return row ? toDTO(row) : null;
  });
}

export async function createEmployee(ctx: RequestContext, input: EmployeeInput): Promise<string> {
  assertPermission(ctx.permissions, "hr:employee:write");
  const data = employeeInputSchema.parse(input);

  return withTenant(ctx.tenantId, async (tx) => {
    const company = await tx.company.findFirstOrThrow({ where: { tenantId: ctx.tenantId }, orderBy: { createdAt: "asc" } });

    const employee = await tx.employee.create({
      data: {
        tenantId: ctx.tenantId,
        companyId: company.id,
        code: data.code || null,
        name: data.name,
        email: data.email || null,
        phone: data.phone || null,
        jobTitle: data.jobTitle || null,
        departmentId: data.departmentId || null,
        reportsToId: data.reportsToId || null,
        employmentType: data.employmentType,
        dateOfJoining: data.dateOfJoining,
        baseSalary: data.baseSalary ?? null,
        currency: data.currency ?? (data.baseSalary != null ? company.currency : null),
        notes: data.notes || null,
        createdBy: ctx.userId,
        updatedBy: ctx.userId,
      },
    });

    await tx.auditLog.create({
      data: { tenantId: ctx.tenantId, entityType: "Employee", entityId: employee.id, action: "created", actorId: ctx.userId, actorName: ctx.userName, changes: { name: { from: null, to: data.name } } },
    });

    return employee.id;
  });
}

export async function updateEmployee(ctx: RequestContext, id: string, input: EmployeeInput): Promise<void> {
  assertPermission(ctx.permissions, "hr:employee:write");
  const data = employeeInputSchema.parse(input);

  await withTenant(ctx.tenantId, async (tx) => {
    if (data.reportsToId === id) {
      throw new Error("An employee cannot report to themselves.");
    }

    const company = await tx.company.findFirstOrThrow({ where: { tenantId: ctx.tenantId }, orderBy: { createdAt: "asc" } });

    await tx.employee.update({
      where: { id },
      data: {
        code: data.code || null,
        name: data.name,
        email: data.email || null,
        phone: data.phone || null,
        jobTitle: data.jobTitle || null,
        departmentId: data.departmentId || null,
        reportsToId: data.reportsToId || null,
        employmentType: data.employmentType,
        dateOfJoining: data.dateOfJoining,
        baseSalary: data.baseSalary ?? null,
        currency: data.currency ?? (data.baseSalary != null ? company.currency : null),
        notes: data.notes || null,
        updatedBy: ctx.userId,
      },
    });
  });
}

export async function setEmployeeStatus(ctx: RequestContext, id: string, input: z.infer<typeof statusInputSchema>): Promise<void> {
  assertPermission(ctx.permissions, "hr:employee:write");
  const data = statusInputSchema.parse(input);

  await withTenant(ctx.tenantId, async (tx) => {
    await tx.employee.update({
      where: { id },
      data: {
        status: data.status,
        dateOfLeaving: data.status === "terminated" ? (data.dateOfLeaving ?? new Date()) : null,
        updatedBy: ctx.userId,
      },
    });

    await tx.auditLog.create({
      data: { tenantId: ctx.tenantId, entityType: "Employee", entityId: id, action: `status:${data.status}`, actorId: ctx.userId, actorName: ctx.userName },
    });
  });
}
