import "server-only";

import { z } from "zod";
import { withTenant, type TenantTransaction } from "@/lib/db/tenant-client";
import { assertPermission } from "@/lib/auth/permissions";
import { compileQuery } from "@/lib/query/prisma-query";
import type { RecordPage, RecordQuery } from "@/lib/query/record-query";
import { computeLeaveDays, computeLeaveBalance, rangesOverlap, type LeaveBalance } from "@/lib/hr/leave";
import type { RequestContext } from "@/server/context";

/**
 * Leave requests. `days` is computed once at creation by the pure
 * `computeLeaveDays` (business days, weekends excluded) and frozen from
 * then on -- the same "compute once, freeze" discipline invoice tax lines
 * already use, so a later change to what counts as a business day never
 * reshapes a request that already went through approval.
 */

export interface LeaveRequestDTO {
  id: string;
  employeeId: string;
  employeeName: string;
  leaveTypeId: string;
  leaveTypeName: string;
  startDate: string;
  endDate: string;
  days: number;
  reason: string | null;
  status: string;
  approvedById: string | null;
  approvedByName: string | null;
  approvedAt: string | null;
  decisionNote: string | null;
  createdAt: string;
}

const SEARCH_FIELDS = ["employee.name", "leaveType.name"];
const ALLOWED_FIELDS = ["startDate", "endDate", "status", "createdAt"];

export const leaveRequestInputSchema = z
  .object({
    employeeId: z.uuid(),
    leaveTypeId: z.uuid(),
    startDate: z.coerce.date(),
    endDate: z.coerce.date(),
    reason: z.string().max(2000).nullish(),
  })
  .refine((d) => d.endDate >= d.startDate, { message: "End date cannot be before the start date.", path: ["endDate"] });
export type LeaveRequestInput = z.infer<typeof leaveRequestInputSchema>;

const decisionInputSchema = z.object({ decisionNote: z.string().max(2000).nullish() });

function toDTO(row: {
  id: string;
  employeeId: string;
  employee: { name: string };
  leaveTypeId: string;
  leaveType: { name: string };
  startDate: Date;
  endDate: Date;
  days: { toString(): string };
  reason: string | null;
  status: string;
  approvedById: string | null;
  approvedAt: Date | null;
  decisionNote: string | null;
  createdAt: Date;
}, approverNames: Map<string, string>): LeaveRequestDTO {
  return {
    id: row.id,
    employeeId: row.employeeId,
    employeeName: row.employee.name,
    leaveTypeId: row.leaveTypeId,
    leaveTypeName: row.leaveType.name,
    startDate: row.startDate.toISOString(),
    endDate: row.endDate.toISOString(),
    days: Number(row.days.toString()),
    reason: row.reason,
    status: row.status,
    approvedById: row.approvedById,
    approvedByName: row.approvedById ? (approverNames.get(row.approvedById) ?? null) : null,
    approvedAt: row.approvedAt?.toISOString() ?? null,
    decisionNote: row.decisionNote,
    createdAt: row.createdAt.toISOString(),
  };
}

async function resolveApproverNames(tx: TenantTransaction, ids: (string | null)[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter((x): x is string => !!x))];
  if (unique.length === 0) return new Map();
  const memberships = await tx.membership.findMany({ where: { userId: { in: unique } }, include: { user: true } });
  return new Map(memberships.map((m) => [m.userId, m.user.name ?? m.user.email]));
}

export async function listLeaveRequests(ctx: RequestContext, query: RecordQuery): Promise<RecordPage<LeaveRequestDTO>> {
  assertPermission(ctx.permissions, "hr:leaverequest:read");

  const compiled = compileQuery(query, { searchFields: SEARCH_FIELDS, allowedFields: ALLOWED_FIELDS });

  return withTenant(ctx.tenantId, async (tx) => {
    const [rows, total] = await Promise.all([
      tx.leaveRequest.findMany({
        where: compiled.where,
        orderBy: compiled.orderBy,
        skip: compiled.skip,
        take: compiled.take,
        include: { employee: { select: { name: true } }, leaveType: { select: { name: true } } },
      }),
      tx.leaveRequest.count({ where: compiled.where }),
    ]);
    const approverNames = await resolveApproverNames(tx, rows.map((r) => r.approvedById));

    return { rows: rows.map((r) => toDTO(r, approverNames)), total, page: query.page, pageSize: compiled.take };
  });
}

/** Every leave request for one employee, newest first -- the employee record page's Leave tab. */
export async function listLeaveRequestsForEmployee(ctx: RequestContext, employeeId: string): Promise<LeaveRequestDTO[]> {
  assertPermission(ctx.permissions, "hr:leaverequest:read");

  return withTenant(ctx.tenantId, async (tx) => {
    const rows = await tx.leaveRequest.findMany({
      where: { employeeId },
      orderBy: { startDate: "desc" },
      include: { employee: { select: { name: true } }, leaveType: { select: { name: true } } },
    });
    const approverNames = await resolveApproverNames(tx, rows.map((r) => r.approvedById));
    return rows.map((r) => toDTO(r, approverNames));
  });
}

/** Derived balance per leave type for one employee, for the current calendar year -- never a stored counter, see src/lib/hr/leave.ts. */
export async function getLeaveBalances(ctx: RequestContext, employeeId: string, year: number = new Date().getFullYear()): Promise<(LeaveBalance & { leaveTypeId: string; leaveTypeName: string })[]> {
  assertPermission(ctx.permissions, "hr:leaverequest:read");

  return withTenant(ctx.tenantId, async (tx) => {
    const leaveTypes = await tx.leaveType.findMany({ where: { deletedAt: null }, orderBy: { name: "asc" } });
    const yearStart = new Date(Date.UTC(year, 0, 1));
    const yearEnd = new Date(Date.UTC(year, 11, 31));

    const approved = await tx.leaveRequest.findMany({
      where: { employeeId, status: "approved", startDate: { gte: yearStart, lte: yearEnd } },
    });

    return leaveTypes.map((lt) => {
      const takenForType = approved.filter((r) => r.leaveTypeId === lt.id).reduce((sum, r) => sum + Number(r.days.toString()), 0);
      const balance = computeLeaveBalance({ annualAllocation: Number(lt.defaultAnnualDays.toString()), approvedDaysTaken: takenForType });
      return { ...balance, leaveTypeId: lt.id, leaveTypeName: lt.name };
    });
  });
}

export async function createLeaveRequest(ctx: RequestContext, input: LeaveRequestInput): Promise<string> {
  assertPermission(ctx.permissions, "hr:leaverequest:write");
  const data = leaveRequestInputSchema.parse(input);
  const days = computeLeaveDays(data.startDate, data.endDate);

  return withTenant(ctx.tenantId, async (tx) => {
    const overlapping = await tx.leaveRequest.findMany({
      where: { employeeId: data.employeeId, status: { in: ["pending", "approved"] } },
      select: { startDate: true, endDate: true },
    });
    if (overlapping.some((r) => rangesOverlap(data.startDate, data.endDate, r.startDate, r.endDate))) {
      throw new Error("This employee already has a pending or approved leave request overlapping these dates.");
    }

    const leaveRequest = await tx.leaveRequest.create({
      data: {
        tenantId: ctx.tenantId,
        employeeId: data.employeeId,
        leaveTypeId: data.leaveTypeId,
        startDate: data.startDate,
        endDate: data.endDate,
        days,
        reason: data.reason || null,
        createdBy: ctx.userId,
      },
    });

    await tx.auditLog.create({
      data: { tenantId: ctx.tenantId, entityType: "LeaveRequest", entityId: leaveRequest.id, action: "requested", actorId: ctx.userId, actorName: ctx.userName, changes: { days: { from: null, to: days } } },
    });

    return leaveRequest.id;
  });
}

async function decide(ctx: RequestContext, id: string, status: "approved" | "rejected", input: z.infer<typeof decisionInputSchema>): Promise<void> {
  assertPermission(ctx.permissions, "hr:leaverequest:approve");
  const data = decisionInputSchema.parse(input);

  await withTenant(ctx.tenantId, async (tx) => {
    const request = await tx.leaveRequest.findUniqueOrThrow({ where: { id } });
    if (request.status !== "pending") {
      throw new Error(`This request is already "${request.status}" and cannot be decided again.`);
    }

    await tx.leaveRequest.update({
      where: { id },
      data: { status, approvedById: ctx.userId, approvedAt: new Date(), decisionNote: data.decisionNote || null },
    });

    await tx.auditLog.create({
      data: { tenantId: ctx.tenantId, entityType: "LeaveRequest", entityId: id, action: status, actorId: ctx.userId, actorName: ctx.userName },
    });
  });
}

export async function approveLeaveRequest(ctx: RequestContext, id: string, input: z.infer<typeof decisionInputSchema> = {}): Promise<void> {
  return decide(ctx, id, "approved", input);
}

export async function rejectLeaveRequest(ctx: RequestContext, id: string, input: z.infer<typeof decisionInputSchema> = {}): Promise<void> {
  return decide(ctx, id, "rejected", input);
}

export async function cancelLeaveRequest(ctx: RequestContext, id: string): Promise<void> {
  assertPermission(ctx.permissions, "hr:leaverequest:write");

  await withTenant(ctx.tenantId, async (tx) => {
    const request = await tx.leaveRequest.findUniqueOrThrow({ where: { id } });
    if (request.status !== "pending") {
      throw new Error(`Only a pending request can be cancelled -- this one is already "${request.status}".`);
    }
    await tx.leaveRequest.update({ where: { id }, data: { status: "cancelled" } });
  });
}
