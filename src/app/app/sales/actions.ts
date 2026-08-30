"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireContext } from "@/server/context";
import { PermissionError } from "@/lib/auth/permissions";
import {
  createSalesOrder,
  updateSalesOrderLines,
  confirmSalesOrder,
  cancelSalesOrder,
  createDelivery,
  createOrderInputSchema,
  createDeliveryInputSchema,
} from "@/server/sales/orders";

export interface ActionResult {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
}

function fieldErrorsOf(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".");
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

function describeError(error: unknown): string {
  if (error instanceof PermissionError) return "You do not have permission to do that.";
  if (error instanceof Error) return error.message;
  return "Something went wrong. Try again.";
}

/**
 * The create form submits a JSON blob for `lines` (a dynamic-length array of
 * product/qty/discount rows) alongside plain fields -- a native <form> has
 * no repeating-group primitive, so the client serialises the line editor's
 * state into one hidden field rather than a `lines[0].productId`-style
 * naming convention that would need its own parser here.
 */
export async function createSalesOrderAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  let linesRaw: unknown;
  try {
    linesRaw = JSON.parse(String(formData.get("lines") ?? "[]"));
  } catch {
    return { ok: false, error: "Could not read the order lines. Try again." };
  }

  const parsed = createOrderInputSchema.safeParse({
    partnerId: formData.get("partnerId"),
    warehouseId: formData.get("warehouseId"),
    invoicingPolicy: formData.get("invoicingPolicy") || "invoice_delivered",
    expectedDeliveryDate: formData.get("expectedDeliveryDate") || null,
    notes: formData.get("notes") || null,
    lines: linesRaw,
  });
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsOf(parsed.error) };

  let orderId: string;
  try {
    const ctx = await requireContext();
    orderId = await createSalesOrder(ctx, parsed.data);
  } catch (error) {
    return { ok: false, error: describeError(error) };
  }

  revalidatePath("/app/sales");
  redirect(`/app/sales/${orderId}`);
}

export async function updateSalesOrderLinesAction(orderId: string, lines: unknown): Promise<ActionResult> {
  const parsed = z.object({ lines: createOrderInputSchema.shape.lines }).safeParse({ lines });
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsOf(parsed.error) };

  try {
    const ctx = await requireContext();
    await updateSalesOrderLines(ctx, orderId, parsed.data);
  } catch (error) {
    return { ok: false, error: describeError(error) };
  }
  revalidatePath(`/app/sales/${orderId}`);
  return { ok: true };
}

export async function confirmSalesOrderAction(orderId: string): Promise<ActionResult> {
  try {
    const ctx = await requireContext();
    await confirmSalesOrder(ctx, orderId);
  } catch (error) {
    return { ok: false, error: describeError(error) };
  }
  revalidatePath(`/app/sales/${orderId}`);
  revalidatePath("/app/sales");
  return { ok: true };
}

export async function cancelSalesOrderAction(orderId: string): Promise<ActionResult> {
  try {
    const ctx = await requireContext();
    await cancelSalesOrder(ctx, orderId);
  } catch (error) {
    return { ok: false, error: describeError(error) };
  }
  revalidatePath(`/app/sales/${orderId}`);
  revalidatePath("/app/sales");
  return { ok: true };
}

export async function createDeliveryAction(
  orderId: string,
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  let linesRaw: unknown;
  try {
    linesRaw = JSON.parse(String(formData.get("lines") ?? "[]"));
  } catch {
    return { ok: false, error: "Could not read the delivery lines. Try again." };
  }

  const parsed = createDeliveryInputSchema.safeParse({
    deliveryDate: formData.get("deliveryDate") || undefined,
    notes: formData.get("notes") || null,
    lines: linesRaw,
  });
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsOf(parsed.error) };

  try {
    const ctx = await requireContext();
    await createDelivery(ctx, orderId, parsed.data);
  } catch (error) {
    return { ok: false, error: describeError(error) };
  }

  revalidatePath(`/app/sales/${orderId}`);
  revalidatePath("/app/sales");
  return { ok: true };
}
