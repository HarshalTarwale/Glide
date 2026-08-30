"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireContext } from "@/server/context";
import { PermissionError } from "@/lib/auth/permissions";
import {
  receiveStock,
  deliverStock,
  transferStock,
  adjustStock,
  receiveStockSchema,
  deliverStockSchema,
  transferStockSchema,
  adjustStockSchema,
} from "@/server/inventory/stock";

export interface ActionResult {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
}

/**
 * One action per move kind, each a thin wrapper around the matching stock.ts
 * function and its Zod schema -- the "one contract, two transports" rule
 * from docs/architecture.md §3.5. The dialog picks which of these four to
 * call based on the move-type selector; nothing here re-implements the
 * ledger/valuation logic that already lives in the service.
 */

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

function coerceForm(formData: FormData) {
  const raw = Object.fromEntries(formData.entries());
  return {
    productId: raw.productId,
    quantity: raw.quantity,
    reference: raw.reference || null,
    lotCode: raw.lotCode || null,
    toLocationId: raw.toLocationId || undefined,
    fromLocationId: raw.fromLocationId || undefined,
    locationId: raw.locationId || undefined,
    unitCost: raw.unitCost || undefined,
    direction: raw.direction || undefined,
  };
}

const numeric = z.coerce.number();

export async function receiveStockAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const raw = coerceForm(formData);
  const parsed = receiveStockSchema.safeParse({
    productId: raw.productId,
    toLocationId: raw.toLocationId,
    quantity: numeric.parse(raw.quantity || 0),
    unitCost: numeric.parse(raw.unitCost || 0),
    reference: raw.reference,
    lotCode: raw.lotCode,
  });
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsOf(parsed.error) };

  try {
    const ctx = await requireContext();
    await receiveStock(ctx, parsed.data);
  } catch (error) {
    return { ok: false, error: describeError(error) };
  }
  revalidatePath("/app/inventory/stock");
  return { ok: true };
}

export async function deliverStockAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const raw = coerceForm(formData);
  const parsed = deliverStockSchema.safeParse({
    productId: raw.productId,
    fromLocationId: raw.fromLocationId,
    quantity: numeric.parse(raw.quantity || 0),
    reference: raw.reference,
    lotCode: raw.lotCode,
  });
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsOf(parsed.error) };

  try {
    const ctx = await requireContext();
    await deliverStock(ctx, parsed.data);
  } catch (error) {
    return { ok: false, error: describeError(error) };
  }
  revalidatePath("/app/inventory/stock");
  return { ok: true };
}

export async function transferStockAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const raw = coerceForm(formData);
  const parsed = transferStockSchema.safeParse({
    productId: raw.productId,
    fromLocationId: raw.fromLocationId,
    toLocationId: raw.toLocationId,
    quantity: numeric.parse(raw.quantity || 0),
    reference: raw.reference,
    lotCode: raw.lotCode,
  });
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsOf(parsed.error) };

  try {
    const ctx = await requireContext();
    await transferStock(ctx, parsed.data);
  } catch (error) {
    return { ok: false, error: describeError(error) };
  }
  revalidatePath("/app/inventory/stock");
  return { ok: true };
}

export async function adjustStockAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const raw = coerceForm(formData);
  const parsed = adjustStockSchema.safeParse({
    productId: raw.productId,
    locationId: raw.locationId,
    direction: raw.direction,
    quantity: numeric.parse(raw.quantity || 0),
    unitCost: raw.unitCost ? numeric.parse(raw.unitCost) : undefined,
    reference: raw.reference,
    lotCode: raw.lotCode,
  });
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsOf(parsed.error) };

  try {
    const ctx = await requireContext();
    await adjustStock(ctx, parsed.data);
  } catch (error) {
    return { ok: false, error: describeError(error) };
  }
  revalidatePath("/app/inventory/stock");
  return { ok: true };
}
