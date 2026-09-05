import "server-only";

import { z } from "zod";
import { withTenant } from "@/lib/db/tenant-client";
import { assertPermission } from "@/lib/auth/permissions";
import type { RequestContext } from "@/server/context";

/** Departments are flat (no hierarchy) and small in number per company -- a plain list, not a paginated DataTable, same treatment as Chart of Accounts. */

export interface DepartmentDTO {
  id: string;
  name: string;
  employeeCount: number;
}

export const departmentInputSchema = z.object({
  name: z.string().min(1, "Name is required").max(200),
});
export type DepartmentInput = z.infer<typeof departmentInputSchema>;

export async function listDepartments(ctx: RequestContext): Promise<DepartmentDTO[]> {
  assertPermission(ctx.permissions, "hr:employee:read");

  return withTenant(ctx.tenantId, async (tx) => {
    const rows = await tx.department.findMany({
      where: { deletedAt: null },
      orderBy: { name: "asc" },
      include: { _count: { select: { employees: true } } },
    });
    return rows.map((r) => ({ id: r.id, name: r.name, employeeCount: r._count.employees }));
  });
}

export async function createDepartment(ctx: RequestContext, input: DepartmentInput): Promise<string> {
  assertPermission(ctx.permissions, "hr:employee:write");
  const data = departmentInputSchema.parse(input);

  return withTenant(ctx.tenantId, async (tx) => {
    const company = await tx.company.findFirstOrThrow({ where: { tenantId: ctx.tenantId }, orderBy: { createdAt: "asc" } });
    const department = await tx.department.create({
      data: { tenantId: ctx.tenantId, companyId: company.id, name: data.name, createdBy: ctx.userId, updatedBy: ctx.userId },
    });
    return department.id;
  });
}

export async function renameDepartment(ctx: RequestContext, id: string, input: DepartmentInput): Promise<void> {
  assertPermission(ctx.permissions, "hr:employee:write");
  const data = departmentInputSchema.parse(input);

  await withTenant(ctx.tenantId, async (tx) => {
    await tx.department.update({ where: { id }, data: { name: data.name, updatedBy: ctx.userId } });
  });
}

export async function deleteDepartment(ctx: RequestContext, id: string): Promise<void> {
  assertPermission(ctx.permissions, "hr:employee:write");

  await withTenant(ctx.tenantId, async (tx) => {
    const count = await tx.employee.count({ where: { departmentId: id, deletedAt: null } });
    if (count > 0) {
      throw new Error("This department still has employees assigned to it. Move them first.");
    }
    await tx.department.update({ where: { id }, data: { deletedAt: new Date(), updatedBy: ctx.userId } });
  });
}
