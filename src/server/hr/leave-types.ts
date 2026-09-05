import "server-only";

import { z } from "zod";
import { withTenant } from "@/lib/db/tenant-client";
import { assertPermission } from "@/lib/auth/permissions";
import type { RequestContext } from "@/server/context";

/** Leave types are tenant-configured reference data -- a plain list, same treatment as Chart of Accounts and Departments. */

export interface LeaveTypeDTO {
  id: string;
  name: string;
  code: string;
  defaultAnnualDays: number;
  isPaid: boolean;
}

export const leaveTypeInputSchema = z.object({
  name: z.string().min(1, "Name is required").max(200),
  code: z.string().min(1, "Code is required").max(30),
  defaultAnnualDays: z.number().min(0),
  isPaid: z.boolean().default(true),
});
export type LeaveTypeInput = z.infer<typeof leaveTypeInputSchema>;

function toDTO(row: { id: string; name: string; code: string; defaultAnnualDays: { toString(): string }; isPaid: boolean }): LeaveTypeDTO {
  return { id: row.id, name: row.name, code: row.code, defaultAnnualDays: Number(row.defaultAnnualDays.toString()), isPaid: row.isPaid };
}

export async function listLeaveTypes(ctx: RequestContext): Promise<LeaveTypeDTO[]> {
  assertPermission(ctx.permissions, "hr:leavetype:read");

  return withTenant(ctx.tenantId, async (tx) => {
    const rows = await tx.leaveType.findMany({ where: { deletedAt: null }, orderBy: { name: "asc" } });
    return rows.map(toDTO);
  });
}

export async function createLeaveType(ctx: RequestContext, input: LeaveTypeInput): Promise<string> {
  assertPermission(ctx.permissions, "hr:leavetype:write");
  const data = leaveTypeInputSchema.parse(input);

  return withTenant(ctx.tenantId, async (tx) => {
    const company = await tx.company.findFirstOrThrow({ where: { tenantId: ctx.tenantId }, orderBy: { createdAt: "asc" } });
    const leaveType = await tx.leaveType.create({
      data: {
        tenantId: ctx.tenantId,
        companyId: company.id,
        name: data.name,
        code: data.code.toUpperCase(),
        defaultAnnualDays: data.defaultAnnualDays,
        isPaid: data.isPaid,
        createdBy: ctx.userId,
        updatedBy: ctx.userId,
      },
    });
    return leaveType.id;
  });
}

export async function updateLeaveType(ctx: RequestContext, id: string, input: LeaveTypeInput): Promise<void> {
  assertPermission(ctx.permissions, "hr:leavetype:write");
  const data = leaveTypeInputSchema.parse(input);

  await withTenant(ctx.tenantId, async (tx) => {
    await tx.leaveType.update({
      where: { id },
      data: { name: data.name, code: data.code.toUpperCase(), defaultAnnualDays: data.defaultAnnualDays, isPaid: data.isPaid, updatedBy: ctx.userId },
    });
  });
}
