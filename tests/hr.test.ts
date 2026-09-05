import { afterAll, describe, expect, it } from "vitest";
import { signup } from "@/server/core/signup";
import { withTenant } from "@/lib/db/tenant-client";
import { createDepartment, listDepartments, deleteDepartment } from "@/server/hr/departments";
import { createEmployee, getEmployee, updateEmployee, setEmployeeStatus, listEmployees } from "@/server/hr/employees";
import { createLeaveType, listLeaveTypes } from "@/server/hr/leave-types";
import {
  createLeaveRequest,
  approveLeaveRequest,
  rejectLeaveRequest,
  cancelLeaveRequest,
  listLeaveRequestsForEmployee,
  getLeaveBalances,
} from "@/server/hr/leave-requests";
import type { RequestContext } from "@/server/context";
import { unionPermissions } from "@/lib/auth/permissions";

/**
 * P6+ HR acceptance gate: an employee can be onboarded into a department,
 * a leave request goes through the pending -> approved workflow with the
 * pure computeLeaveDays() count frozen at creation, a second overlapping
 * request is blocked, the derived leave balance matches the pure
 * computeLeaveBalance() function applied to the same approved rows, and
 * everything is tenant-isolated.
 */

const hasDatabase =
  Boolean(process.env.DATABASE_URL) && !process.env.DATABASE_URL?.includes("placeholder");
const describeWithDb = hasDatabase ? describe : describe.skip;

async function makeOwnerContext(orgName: string) {
  const result = await signup({
    name: "Test Owner",
    email: `hr-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`,
    password: "password123",
    organisation: orgName,
    country: "IN",
  });
  if (!result.ok) throw new Error(result.error);

  return withTenant(result.tenantId, async (tx) => {
    const membership = await tx.membership.findFirstOrThrow({
      where: { tenantId: result.tenantId, userId: result.userId },
      include: { roles: { include: { role: true } } },
    });
    const roles = membership.roles.map((r) => r.role);
    const tenant = await tx.tenant.findUniqueOrThrow({ where: { id: result.tenantId } });
    const ctx: RequestContext = {
      userId: result.userId,
      userName: "Test Owner",
      userEmail: "",
      tenantId: result.tenantId,
      tenantName: orgName,
      country: tenant.country,
      currency: tenant.currency,
      isOwner: true,
      permissions: unionPermissions(roles),
      recordScopes: [],
      availableTenants: [],
    };
    return ctx;
  });
}

describeWithDb("HR", () => {
  const tenantIds: string[] = [];
  afterAll(async () => {
    const { prisma } = await import("@/lib/db/client");
    for (const id of tenantIds) await withTenant(id, (tx) => tx.tenant.delete({ where: { id } }));
    await prisma.$disconnect();
  });

  it("an employee can be created in a department, moved, and its status changed", async () => {
    const ctx = await makeOwnerContext("HR Directory Co");
    tenantIds.push(ctx.tenantId);

    const deptId = await createDepartment(ctx, { name: "Engineering" });
    const departments = await listDepartments(ctx);
    expect(departments.find((d) => d.id === deptId)?.employeeCount).toBe(0);

    const employeeId = await createEmployee(ctx, {
      name: "Asha Rao",
      email: "asha@example.com",
      jobTitle: "Software Engineer",
      departmentId: deptId,
      employmentType: "full_time",
      dateOfJoining: new Date("2024-01-15"),
    });

    const created = await getEmployee(ctx, employeeId);
    expect(created!.departmentName).toBe("Engineering");
    expect(created!.status).toBe("active");

    const departmentsAfter = await listDepartments(ctx);
    expect(departmentsAfter.find((d) => d.id === deptId)?.employeeCount).toBe(1);

    // A department with an employee still assigned cannot be deleted.
    await expect(deleteDepartment(ctx, deptId)).rejects.toThrow(/still has employees assigned/);

    await updateEmployee(ctx, employeeId, {
      name: "Asha Rao",
      jobTitle: "Senior Software Engineer",
      departmentId: null,
      employmentType: "full_time",
      dateOfJoining: new Date("2024-01-15"),
    });
    const moved = await getEmployee(ctx, employeeId);
    expect(moved!.departmentName).toBeNull();
    expect(moved!.jobTitle).toBe("Senior Software Engineer");

    await setEmployeeStatus(ctx, employeeId, { status: "terminated", dateOfLeaving: new Date("2026-01-01") });
    const terminated = await getEmployee(ctx, employeeId);
    expect(terminated!.status).toBe("terminated");
    expect(terminated!.dateOfLeaving).not.toBeNull();
  });

  it("an employee cannot be set to report to themselves", async () => {
    const ctx = await makeOwnerContext("HR Self Report Co");
    tenantIds.push(ctx.tenantId);

    const employeeId = await createEmployee(ctx, { name: "Solo Employee", employmentType: "full_time", dateOfJoining: new Date("2025-01-01") });

    await expect(
      updateEmployee(ctx, employeeId, { name: "Solo Employee", reportsToId: employeeId, employmentType: "full_time", dateOfJoining: new Date("2025-01-01") })
    ).rejects.toThrow(/cannot report to themselves/);
  });

  it("a leave request's day count is computed once (business days, weekends excluded) and frozen", async () => {
    const ctx = await makeOwnerContext("HR Leave Co");
    tenantIds.push(ctx.tenantId);

    const employeeId = await createEmployee(ctx, { name: "Leave Taker", employmentType: "full_time", dateOfJoining: new Date("2025-01-01") });
    const leaveTypeId = await createLeaveType(ctx, { name: "Annual Leave", code: "annual", defaultAnnualDays: 20, isPaid: true });

    const leaveTypes = await listLeaveTypes(ctx);
    expect(leaveTypes.find((t) => t.id === leaveTypeId)?.code).toBe("ANNUAL");

    // Mon 2026-09-07 .. Fri 2026-09-11 = 5 business days.
    const requestId = await createLeaveRequest(ctx, {
      employeeId,
      leaveTypeId,
      startDate: new Date("2026-09-07"),
      endDate: new Date("2026-09-11"),
      reason: "Family trip",
    });

    const requests = await listLeaveRequestsForEmployee(ctx, employeeId);
    expect(requests).toHaveLength(1);
    expect(requests[0].days).toBe(5);
    expect(requests[0].status).toBe("pending");

    await approveLeaveRequest(ctx, requestId);
    const afterApproval = await listLeaveRequestsForEmployee(ctx, employeeId);
    expect(afterApproval[0].status).toBe("approved");
    expect(afterApproval[0].approvedByName).toBeTruthy();

    const balances = await getLeaveBalances(ctx, employeeId, 2026);
    const annual = balances.find((b) => b.leaveTypeId === leaveTypeId);
    expect(annual!.allocated).toBe(20);
    expect(annual!.taken).toBe(5);
    expect(annual!.remaining).toBe(15);
  });

  it("blocks a second pending/approved request that overlaps an existing one for the same employee", async () => {
    const ctx = await makeOwnerContext("HR Overlap Co");
    tenantIds.push(ctx.tenantId);

    const employeeId = await createEmployee(ctx, { name: "Overlap Employee", employmentType: "full_time", dateOfJoining: new Date("2025-01-01") });
    const leaveTypeId = await createLeaveType(ctx, { name: "Sick Leave", code: "sick", defaultAnnualDays: 10, isPaid: true });

    await createLeaveRequest(ctx, { employeeId, leaveTypeId, startDate: new Date("2026-10-05"), endDate: new Date("2026-10-09") });

    await expect(
      createLeaveRequest(ctx, { employeeId, leaveTypeId, startDate: new Date("2026-10-08"), endDate: new Date("2026-10-12") })
    ).rejects.toThrow(/overlapping/);
  });

  it("a rejected or cancelled request can never be decided again, and only a pending request can be cancelled", async () => {
    const ctx = await makeOwnerContext("HR Decision Co");
    tenantIds.push(ctx.tenantId);

    const employeeId = await createEmployee(ctx, { name: "Decision Employee", employmentType: "full_time", dateOfJoining: new Date("2025-01-01") });
    const leaveTypeId = await createLeaveType(ctx, { name: "Unpaid Leave", code: "unpaid", defaultAnnualDays: 0, isPaid: false });

    const requestId = await createLeaveRequest(ctx, { employeeId, leaveTypeId, startDate: new Date("2026-11-02"), endDate: new Date("2026-11-02") });
    await rejectLeaveRequest(ctx, requestId, { decisionNote: "Team is short-staffed that week" });

    await expect(approveLeaveRequest(ctx, requestId)).rejects.toThrow(/already "rejected"/);
    await expect(cancelLeaveRequest(ctx, requestId)).rejects.toThrow(/Only a pending request/);

    const secondRequestId = await createLeaveRequest(ctx, { employeeId, leaveTypeId, startDate: new Date("2026-12-01"), endDate: new Date("2026-12-01") });
    await cancelLeaveRequest(ctx, secondRequestId);
    const requests = await listLeaveRequestsForEmployee(ctx, employeeId);
    expect(requests.find((r) => r.id === secondRequestId)?.status).toBe("cancelled");
  });

  it("is scoped per tenant -- one tenant's employees never show up in another's list", async () => {
    const ctxA = await makeOwnerContext("HR Isolation A");
    const ctxB = await makeOwnerContext("HR Isolation B");
    tenantIds.push(ctxA.tenantId, ctxB.tenantId);

    await createEmployee(ctxA, { name: "Only In A", employmentType: "full_time", dateOfJoining: new Date("2025-01-01") });

    const page = await listEmployees(ctxB, { page: 1, pageSize: 50, filters: [], sort: [] });
    expect(page.rows).toHaveLength(0);
  });
});
