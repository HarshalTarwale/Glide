"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireContext } from "@/server/context";
import { PermissionError } from "@/lib/auth/permissions";
import { createDepartment, renameDepartment, deleteDepartment, departmentInputSchema } from "@/server/hr/departments";
import { createEmployee, updateEmployee, setEmployeeStatus, employeeInputSchema } from "@/server/hr/employees";
import { createLeaveType, updateLeaveType, leaveTypeInputSchema } from "@/server/hr/leave-types";
import { createLeaveRequest, approveLeaveRequest, rejectLeaveRequest, cancelLeaveRequest, leaveRequestInputSchema } from "@/server/hr/leave-requests";

export interface ActionResult {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
  id?: string;
}

function fieldErrorsOf(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path[0];
    if (typeof key === "string" && !out[key]) out[key] = issue.message;
  }
  return out;
}

function describeError(error: unknown): string {
  if (error instanceof PermissionError) return "You do not have permission to do that.";
  if (error instanceof Error) return error.message;
  return "Something went wrong. Try again.";
}

/* ------------------------------------------------------------------ */
/* Departments                                                         */
/* ------------------------------------------------------------------ */

export async function createDepartmentAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const parsed = departmentInputSchema.safeParse({ name: formData.get("name") });
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsOf(parsed.error) };

  try {
    const ctx = await requireContext();
    await createDepartment(ctx, parsed.data);
  } catch (error) {
    return { ok: false, error: describeError(error) };
  }
  revalidatePath("/app/hr/departments");
  return { ok: true };
}

export async function renameDepartmentAction(id: string, _prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const parsed = departmentInputSchema.safeParse({ name: formData.get("name") });
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsOf(parsed.error) };

  try {
    const ctx = await requireContext();
    await renameDepartment(ctx, id, parsed.data);
  } catch (error) {
    return { ok: false, error: describeError(error) };
  }
  revalidatePath("/app/hr/departments");
  return { ok: true };
}

export async function deleteDepartmentAction(id: string): Promise<ActionResult> {
  try {
    const ctx = await requireContext();
    await deleteDepartment(ctx, id);
  } catch (error) {
    return { ok: false, error: describeError(error) };
  }
  revalidatePath("/app/hr/departments");
  return { ok: true };
}

/* ------------------------------------------------------------------ */
/* Employees                                                            */
/* ------------------------------------------------------------------ */

function parseEmployeeForm(formData: FormData) {
  return employeeInputSchema.safeParse({
    code: formData.get("code") || null,
    name: formData.get("name"),
    email: formData.get("email") || null,
    phone: formData.get("phone") || null,
    jobTitle: formData.get("jobTitle") || null,
    departmentId: formData.get("departmentId") || null,
    reportsToId: formData.get("reportsToId") || null,
    employmentType: formData.get("employmentType") || "full_time",
    dateOfJoining: formData.get("dateOfJoining"),
    baseSalary: formData.get("baseSalary") ? Number(formData.get("baseSalary")) : null,
    currency: formData.get("currency") || null,
    notes: formData.get("notes") || null,
  });
}

export async function createEmployeeAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const parsed = parseEmployeeForm(formData);
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsOf(parsed.error) };

  let employeeId: string;
  try {
    const ctx = await requireContext();
    employeeId = await createEmployee(ctx, parsed.data);
  } catch (error) {
    return { ok: false, error: describeError(error) };
  }

  revalidatePath("/app/hr/employees");
  redirect(`/app/hr/employees/${employeeId}`);
}

export async function updateEmployeeAction(id: string, _prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const parsed = parseEmployeeForm(formData);
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsOf(parsed.error) };

  try {
    const ctx = await requireContext();
    await updateEmployee(ctx, id, parsed.data);
  } catch (error) {
    return { ok: false, error: describeError(error) };
  }
  revalidatePath(`/app/hr/employees/${id}`);
  revalidatePath("/app/hr/employees");
  return { ok: true };
}

export async function setEmployeeStatusAction(id: string, status: string, dateOfLeaving?: string | null): Promise<ActionResult> {
  try {
    const ctx = await requireContext();
    await setEmployeeStatus(ctx, id, { status: status as "active" | "on_leave" | "terminated", dateOfLeaving: dateOfLeaving ? new Date(dateOfLeaving) : null });
  } catch (error) {
    return { ok: false, error: describeError(error) };
  }
  revalidatePath(`/app/hr/employees/${id}`);
  revalidatePath("/app/hr/employees");
  return { ok: true };
}

/* ------------------------------------------------------------------ */
/* Leave types                                                         */
/* ------------------------------------------------------------------ */

function parseLeaveTypeForm(formData: FormData) {
  return leaveTypeInputSchema.safeParse({
    name: formData.get("name"),
    code: formData.get("code"),
    defaultAnnualDays: Number(formData.get("defaultAnnualDays") ?? 0),
    isPaid: formData.get("isPaid") === "on",
  });
}

export async function createLeaveTypeAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const parsed = parseLeaveTypeForm(formData);
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsOf(parsed.error) };

  try {
    const ctx = await requireContext();
    await createLeaveType(ctx, parsed.data);
  } catch (error) {
    return { ok: false, error: describeError(error) };
  }
  revalidatePath("/app/hr/leave-types");
  return { ok: true };
}

export async function updateLeaveTypeAction(id: string, _prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const parsed = parseLeaveTypeForm(formData);
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsOf(parsed.error) };

  try {
    const ctx = await requireContext();
    await updateLeaveType(ctx, id, parsed.data);
  } catch (error) {
    return { ok: false, error: describeError(error) };
  }
  revalidatePath("/app/hr/leave-types");
  return { ok: true };
}

/* ------------------------------------------------------------------ */
/* Leave requests                                                       */
/* ------------------------------------------------------------------ */

export async function createLeaveRequestAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const parsed = leaveRequestInputSchema.safeParse({
    employeeId: formData.get("employeeId"),
    leaveTypeId: formData.get("leaveTypeId"),
    startDate: formData.get("startDate"),
    endDate: formData.get("endDate"),
    reason: formData.get("reason") || null,
  });
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsOf(parsed.error) };

  let requestId: string;
  try {
    const ctx = await requireContext();
    requestId = await createLeaveRequest(ctx, parsed.data);
  } catch (error) {
    return { ok: false, error: describeError(error) };
  }

  revalidatePath("/app/hr/leave-requests");
  revalidatePath(`/app/hr/employees/${parsed.data.employeeId}`);
  return { ok: true, id: requestId };
}

export async function approveLeaveRequestAction(id: string, employeeId: string, decisionNote?: string | null): Promise<ActionResult> {
  try {
    const ctx = await requireContext();
    await approveLeaveRequest(ctx, id, { decisionNote });
  } catch (error) {
    return { ok: false, error: describeError(error) };
  }
  revalidatePath("/app/hr/leave-requests");
  revalidatePath(`/app/hr/employees/${employeeId}`);
  return { ok: true };
}

export async function rejectLeaveRequestAction(id: string, employeeId: string, decisionNote?: string | null): Promise<ActionResult> {
  try {
    const ctx = await requireContext();
    await rejectLeaveRequest(ctx, id, { decisionNote });
  } catch (error) {
    return { ok: false, error: describeError(error) };
  }
  revalidatePath("/app/hr/leave-requests");
  revalidatePath(`/app/hr/employees/${employeeId}`);
  return { ok: true };
}

export async function cancelLeaveRequestAction(id: string, employeeId: string): Promise<ActionResult> {
  try {
    const ctx = await requireContext();
    await cancelLeaveRequest(ctx, id);
  } catch (error) {
    return { ok: false, error: describeError(error) };
  }
  revalidatePath("/app/hr/leave-requests");
  revalidatePath(`/app/hr/employees/${employeeId}`);
  return { ok: true };
}
