"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireContext } from "@/server/context";
import { PermissionError } from "@/lib/auth/permissions";
import { updateCompany, updateCompanySchema } from "@/server/core/company";
import { createTaxRate, updateTaxRate, deleteTaxRate, taxRateInputSchema } from "@/server/core/tax-rates";

export interface ActionResult {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
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

export async function updateCompanyAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const parsed = updateCompanySchema.safeParse({
    name: formData.get("name"),
    legalName: formData.get("legalName") || null,
    taxId: formData.get("taxId") || null,
    addressLine1: formData.get("addressLine1") || null,
    addressLine2: formData.get("addressLine2") || null,
    city: formData.get("city") || null,
    region: formData.get("region") || null,
    postalCode: formData.get("postalCode") || null,
  });
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsOf(parsed.error) };

  try {
    const ctx = await requireContext();
    await updateCompany(ctx, parsed.data);
  } catch (error) {
    return { ok: false, error: describeError(error) };
  }
  revalidatePath("/app/settings");
  return { ok: true };
}

function parseTaxRateForm(formData: FormData) {
  const raw = Object.fromEntries(formData.entries());
  return taxRateInputSchema.safeParse({
    name: raw.name,
    country: raw.country,
    region: raw.region || null,
    rate: Number(raw.rate) || 0,
    level: raw.level,
    taxCategoryId: raw.taxCategoryId || null,
    isActive: raw.isActive === "on",
  });
}

export async function createTaxRateAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const parsed = parseTaxRateForm(formData);
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsOf(parsed.error) };

  try {
    const ctx = await requireContext();
    await createTaxRate(ctx, parsed.data);
  } catch (error) {
    return { ok: false, error: describeError(error) };
  }
  revalidatePath("/app/settings");
  return { ok: true };
}

export async function updateTaxRateAction(
  id: string,
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const parsed = parseTaxRateForm(formData);
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsOf(parsed.error) };

  try {
    const ctx = await requireContext();
    await updateTaxRate(ctx, id, parsed.data);
  } catch (error) {
    return { ok: false, error: describeError(error) };
  }
  revalidatePath("/app/settings");
  return { ok: true };
}

export async function deleteTaxRateAction(id: string): Promise<ActionResult> {
  try {
    const ctx = await requireContext();
    await deleteTaxRate(ctx, id);
  } catch (error) {
    return { ok: false, error: describeError(error) };
  }
  revalidatePath("/app/settings");
  return { ok: true };
}
