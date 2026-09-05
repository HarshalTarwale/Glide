import "server-only";

import { withTenant } from "@/lib/db/tenant-client";
import type { RequestContext } from "@/server/context";

export interface HrFormOptions {
  departments: { id: string; name: string }[];
  employees: { id: string; name: string }[];
  leaveTypes: { id: string; name: string }[];
}

export async function getHrFormOptions(ctx: RequestContext): Promise<HrFormOptions> {
  return withTenant(ctx.tenantId, async (tx) => {
    const [departments, employees, leaveTypes] = await Promise.all([
      tx.department.findMany({ where: { deletedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
      tx.employee.findMany({ where: { deletedAt: null, status: { not: "terminated" } }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
      tx.leaveType.findMany({ where: { deletedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    ]);
    return { departments, employees, leaveTypes };
  });
}
