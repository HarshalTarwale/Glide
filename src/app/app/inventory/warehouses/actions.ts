"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireContext } from "@/server/context";
import { PermissionError } from "@/lib/auth/permissions";
import { createWarehouse, updateWarehouse, archiveWarehouse, warehouseInputSchema } from "@/server/inventory/warehouses";

export interface ActionResult {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
}

function parseForm(formData: FormData) {
  const raw = Object.fromEntries(formData.entries());
  return warehouseInputSchema.safeParse({
    code: raw.code,
    name: raw.name,
    addressLine1: raw.addressLine1 || null,
    city: raw.city || null,
    region: raw.region || null,
    postalCode: raw.postalCode || null,
    country: raw.country || null,
  });
}

function fieldErrorsOf(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path[0];
    if (typeof key === "string" && !out[key]) out[key] = issue.message;
  }
  return out;
}

export async function createWarehouseAction(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const parsed = parseForm(formData);
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsOf(parsed.error) };

  try {
    const ctx = await requireContext();
    await createWarehouse(ctx, parsed.data);
  } catch (error) {
    return { ok: false, error: describeError(error) };
  }

  revalidatePath("/app/inventory/warehouses");
  return { ok: true };
}

export async function updateWarehouseAction(
  id: string,
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const parsed = parseForm(formData);
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsOf(parsed.error) };

  try {
    const ctx = await requireContext();
    await updateWarehouse(ctx, id, parsed.data);
  } catch (error) {
    return { ok: false, error: describeError(error) };
  }

  revalidatePath("/app/inventory/warehouses");
  return { ok: true };
}

export async function archiveWarehouseAction(id: string): Promise<ActionResult> {
  try {
    const ctx = await requireContext();
    await archiveWarehouse(ctx, id);
  } catch (error) {
    return { ok: false, error: describeError(error) };
  }

  revalidatePath("/app/inventory/warehouses");
  return { ok: true };
}

function describeError(error: unknown): string {
  if (error instanceof PermissionError) return "You do not have permission to do that.";
  if (error && typeof error === "object" && "code" in error && error.code === "P2002") {
    return "That warehouse code is already in use.";
  }
  return "Something went wrong. Try again.";
}
