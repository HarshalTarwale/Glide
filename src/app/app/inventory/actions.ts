"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireContext } from "@/server/context";
import { PermissionError } from "@/lib/auth/permissions";
import {
  createProduct,
  updateProduct,
  archiveProduct,
  productInputSchema,
} from "@/server/catalog/products";

export interface ActionResult {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
}

/**
 * Every action here: requireContext (redirects if signed out) -> the
 * SAME service function and Zod schema the DAL exposes -> revalidatePath.
 * Nothing is re-implemented for the form; this is a thin transport, exactly
 * the "one contract, two transports" rule in docs/architecture.md §3.5 --
 * the REST /api/v1 route for the same operation, when it exists, will call
 * createProduct/updateProduct too.
 */

const formSchema = productInputSchema.extend({
  // HTML forms submit everything as strings; coerce at the edge, validate
  // with the real schema underneath.
  salesPrice: z.coerce.number().min(0),
  costPrice: z.coerce.number().min(0),
});

function parseForm(formData: FormData) {
  const raw = Object.fromEntries(formData.entries());
  return formSchema.safeParse({
    sku: raw.sku,
    name: raw.name,
    type: raw.type,
    categoryId: raw.categoryId || null,
    uomId: raw.uomId,
    salesPrice: raw.salesPrice,
    costPrice: raw.costPrice,
    taxCategoryId: raw.taxCategoryId || null,
    hsnCode: raw.hsnCode || null,
    tracking: raw.tracking,
    isSellable: raw.isSellable === "on",
    isPurchasable: raw.isPurchasable === "on",
    isActive: raw.isActive === "on",
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

export async function createProductAction(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const parsed = parseForm(formData);
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsOf(parsed.error) };

  try {
    const ctx = await requireContext();
    await createProduct(ctx, parsed.data);
  } catch (error) {
    return { ok: false, error: describeError(error) };
  }

  revalidatePath("/app/inventory");
  return { ok: true };
}

export async function updateProductAction(
  id: string,
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const parsed = parseForm(formData);
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsOf(parsed.error) };

  try {
    const ctx = await requireContext();
    await updateProduct(ctx, id, parsed.data);
  } catch (error) {
    return { ok: false, error: describeError(error) };
  }

  revalidatePath("/app/inventory");
  return { ok: true };
}

export async function archiveProductAction(id: string): Promise<ActionResult> {
  try {
    const ctx = await requireContext();
    await archiveProduct(ctx, id);
  } catch (error) {
    return { ok: false, error: describeError(error) };
  }

  revalidatePath("/app/inventory");
  return { ok: true };
}

function describeError(error: unknown): string {
  if (error instanceof PermissionError) {
    return "You do not have permission to do that.";
  }
  if (error && typeof error === "object" && "code" in error && error.code === "P2002") {
    return "That SKU is already in use.";
  }
  return "Something went wrong. Try again.";
}
