"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireContext } from "@/server/context";
import { PermissionError } from "@/lib/auth/permissions";
import { createBom, updateBom, deactivateBom, bomInputSchema } from "@/server/manufacturing/boms";
import {
  createWorkOrder,
  updateWorkOrder,
  confirmWorkOrder,
  cancelWorkOrder,
  completeWorkOrder,
  createWorkOrderInputSchema,
} from "@/server/manufacturing/work-orders";

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
/* Bills of Materials                                                   */
/* ------------------------------------------------------------------ */

function parseBomFormData(formData: FormData) {
  let linesRaw: unknown = [];
  try {
    linesRaw = JSON.parse(String(formData.get("lines") ?? "[]"));
  } catch {
    linesRaw = [];
  }

  return bomInputSchema.safeParse({
    productId: formData.get("productId"),
    quantity: Number(formData.get("quantity") ?? 1),
    isActive: formData.get("isActive") === "on",
    notes: formData.get("notes") || null,
    lines: linesRaw,
  });
}

export async function createBomAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const parsed = parseBomFormData(formData);
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsOf(parsed.error) };

  try {
    const ctx = await requireContext();
    await createBom(ctx, parsed.data);
  } catch (error) {
    return { ok: false, error: describeError(error) };
  }
  revalidatePath("/app/manufacturing/boms");
  return { ok: true };
}

export async function updateBomAction(id: string, _prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const parsed = parseBomFormData(formData);
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsOf(parsed.error) };

  try {
    const ctx = await requireContext();
    await updateBom(ctx, id, parsed.data);
  } catch (error) {
    return { ok: false, error: describeError(error) };
  }
  revalidatePath("/app/manufacturing/boms");
  return { ok: true };
}

export async function deactivateBomAction(id: string): Promise<ActionResult> {
  try {
    const ctx = await requireContext();
    await deactivateBom(ctx, id);
  } catch (error) {
    return { ok: false, error: describeError(error) };
  }
  revalidatePath("/app/manufacturing/boms");
  return { ok: true };
}

/* ------------------------------------------------------------------ */
/* Work orders                                                          */
/* ------------------------------------------------------------------ */

export async function createWorkOrderAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const parsed = createWorkOrderInputSchema.safeParse({
    bomId: formData.get("bomId"),
    warehouseId: formData.get("warehouseId"),
    quantity: Number(formData.get("quantity") ?? 0),
    scheduledDate: formData.get("scheduledDate") || null,
    notes: formData.get("notes") || null,
  });
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsOf(parsed.error) };

  let id: string;
  try {
    const ctx = await requireContext();
    id = await createWorkOrder(ctx, parsed.data);
  } catch (error) {
    return { ok: false, error: describeError(error) };
  }

  revalidatePath("/app/manufacturing/work-orders");
  redirect(`/app/manufacturing/work-orders/${id}`);
}

export async function updateWorkOrderAction(id: string, formData: FormData): Promise<ActionResult> {
  const parsed = createWorkOrderInputSchema.safeParse({
    bomId: formData.get("bomId"),
    warehouseId: formData.get("warehouseId"),
    quantity: Number(formData.get("quantity") ?? 0),
    scheduledDate: formData.get("scheduledDate") || null,
    notes: formData.get("notes") || null,
  });
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsOf(parsed.error) };

  try {
    const ctx = await requireContext();
    await updateWorkOrder(ctx, id, parsed.data);
  } catch (error) {
    return { ok: false, error: describeError(error) };
  }
  revalidatePath(`/app/manufacturing/work-orders/${id}`);
  revalidatePath("/app/manufacturing/work-orders");
  return { ok: true };
}

export async function confirmWorkOrderAction(id: string): Promise<ActionResult> {
  try {
    const ctx = await requireContext();
    await confirmWorkOrder(ctx, id);
  } catch (error) {
    return { ok: false, error: describeError(error) };
  }
  revalidatePath(`/app/manufacturing/work-orders/${id}`);
  revalidatePath("/app/manufacturing/work-orders");
  return { ok: true };
}

export async function completeWorkOrderAction(id: string): Promise<ActionResult> {
  try {
    const ctx = await requireContext();
    await completeWorkOrder(ctx, id);
  } catch (error) {
    return { ok: false, error: describeError(error) };
  }
  revalidatePath(`/app/manufacturing/work-orders/${id}`);
  revalidatePath("/app/manufacturing/work-orders");
  revalidatePath("/app/inventory/stock");
  return { ok: true };
}

export async function cancelWorkOrderAction(id: string): Promise<ActionResult> {
  try {
    const ctx = await requireContext();
    await cancelWorkOrder(ctx, id);
  } catch (error) {
    return { ok: false, error: describeError(error) };
  }
  revalidatePath(`/app/manufacturing/work-orders/${id}`);
  revalidatePath("/app/manufacturing/work-orders");
  return { ok: true };
}
