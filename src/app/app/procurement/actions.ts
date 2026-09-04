"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireContext } from "@/server/context";
import { PermissionError } from "@/lib/auth/permissions";
import {
  createPurchaseOrder,
  updatePurchaseOrderLines,
  confirmPurchaseOrder,
  cancelPurchaseOrder,
  createReceipt,
  createOrderInputSchema,
  createReceiptInputSchema,
} from "@/server/procurement/orders";
import {
  createStandaloneBill,
  createBillFromOrder,
  postBill,
  cancelBill,
  createStandaloneBillInputSchema,
  createBillFromOrderInputSchema,
} from "@/server/procurement/bills";
import { recordBillPayment, allocateBillPayment, recordBillPaymentInputSchema, allocateBillPaymentInputSchema, getOpenBillsForPartner } from "@/server/procurement/bill-payments";

export interface ActionResult {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
  id?: string;
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

/* ------------------------------------------------------------------ */
/* Purchase orders                                                     */
/* ------------------------------------------------------------------ */

export async function createPurchaseOrderAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  let linesRaw: unknown;
  try {
    linesRaw = JSON.parse(String(formData.get("lines") ?? "[]"));
  } catch {
    return { ok: false, error: "Could not read the order lines. Try again." };
  }

  const parsed = createOrderInputSchema.safeParse({
    partnerId: formData.get("partnerId"),
    warehouseId: formData.get("warehouseId"),
    billingPolicy: formData.get("billingPolicy") || "bill_received",
    expectedReceiptDate: formData.get("expectedReceiptDate") || null,
    notes: formData.get("notes") || null,
    lines: linesRaw,
  });
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsOf(parsed.error) };

  let orderId: string;
  try {
    const ctx = await requireContext();
    orderId = await createPurchaseOrder(ctx, parsed.data);
  } catch (error) {
    return { ok: false, error: describeError(error) };
  }

  revalidatePath("/app/procurement/orders");
  redirect(`/app/procurement/orders/${orderId}`);
}

export async function updatePurchaseOrderLinesAction(orderId: string, lines: unknown): Promise<ActionResult> {
  const parsed = z.object({ lines: createOrderInputSchema.shape.lines }).safeParse({ lines });
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsOf(parsed.error) };

  try {
    const ctx = await requireContext();
    await updatePurchaseOrderLines(ctx, orderId, parsed.data);
  } catch (error) {
    return { ok: false, error: describeError(error) };
  }
  revalidatePath(`/app/procurement/orders/${orderId}`);
  return { ok: true };
}

export async function confirmPurchaseOrderAction(orderId: string): Promise<ActionResult> {
  try {
    const ctx = await requireContext();
    await confirmPurchaseOrder(ctx, orderId);
  } catch (error) {
    return { ok: false, error: describeError(error) };
  }
  revalidatePath(`/app/procurement/orders/${orderId}`);
  revalidatePath("/app/procurement/orders");
  return { ok: true };
}

export async function cancelPurchaseOrderAction(orderId: string): Promise<ActionResult> {
  try {
    const ctx = await requireContext();
    await cancelPurchaseOrder(ctx, orderId);
  } catch (error) {
    return { ok: false, error: describeError(error) };
  }
  revalidatePath(`/app/procurement/orders/${orderId}`);
  revalidatePath("/app/procurement/orders");
  return { ok: true };
}

export async function createReceiptAction(orderId: string, _prev: ActionResult, formData: FormData): Promise<ActionResult> {
  let linesRaw: unknown;
  try {
    linesRaw = JSON.parse(String(formData.get("lines") ?? "[]"));
  } catch {
    return { ok: false, error: "Could not read the receipt lines. Try again." };
  }

  const parsed = createReceiptInputSchema.safeParse({
    receiptDate: formData.get("receiptDate") || undefined,
    notes: formData.get("notes") || null,
    lines: linesRaw,
  });
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsOf(parsed.error) };

  try {
    const ctx = await requireContext();
    await createReceipt(ctx, orderId, parsed.data);
  } catch (error) {
    return { ok: false, error: describeError(error) };
  }

  revalidatePath(`/app/procurement/orders/${orderId}`);
  revalidatePath("/app/procurement/orders");
  return { ok: true };
}

/* ------------------------------------------------------------------ */
/* Bills                                                                */
/* ------------------------------------------------------------------ */

export async function createStandaloneBillAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  let linesRaw: unknown;
  try {
    linesRaw = JSON.parse(String(formData.get("lines") ?? "[]"));
  } catch {
    return { ok: false, error: "Could not read the bill lines. Try again." };
  }

  const parsed = createStandaloneBillInputSchema.safeParse({
    partnerId: formData.get("partnerId"),
    dueDate: formData.get("dueDate") || null,
    notes: formData.get("notes") || null,
    lines: linesRaw,
  });
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsOf(parsed.error) };

  let billId: string;
  try {
    const ctx = await requireContext();
    billId = await createStandaloneBill(ctx, parsed.data);
  } catch (error) {
    return { ok: false, error: describeError(error) };
  }

  revalidatePath("/app/procurement/bills");
  redirect(`/app/procurement/bills/${billId}`);
}

export async function createBillFromOrderAction(orderId: string, _prev: ActionResult, formData: FormData): Promise<ActionResult> {
  let linesRaw: unknown;
  try {
    linesRaw = JSON.parse(String(formData.get("lines") ?? "[]"));
  } catch {
    return { ok: false, error: "Could not read the bill lines. Try again." };
  }

  const parsed = createBillFromOrderInputSchema.safeParse({
    dueDate: formData.get("dueDate") || null,
    notes: formData.get("notes") || null,
    lines: linesRaw,
  });
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsOf(parsed.error) };

  let billId: string;
  try {
    const ctx = await requireContext();
    billId = await createBillFromOrder(ctx, orderId, parsed.data);
  } catch (error) {
    return { ok: false, error: describeError(error) };
  }

  revalidatePath(`/app/procurement/orders/${orderId}`);
  revalidatePath("/app/procurement/bills");
  redirect(`/app/procurement/bills/${billId}`);
}

export async function postBillAction(billId: string): Promise<ActionResult> {
  try {
    const ctx = await requireContext();
    await postBill(ctx, billId);
  } catch (error) {
    return { ok: false, error: describeError(error) };
  }
  revalidatePath(`/app/procurement/bills/${billId}`);
  revalidatePath("/app/procurement/bills");
  return { ok: true };
}

export async function cancelBillAction(billId: string): Promise<ActionResult> {
  try {
    const ctx = await requireContext();
    await cancelBill(ctx, billId);
  } catch (error) {
    return { ok: false, error: describeError(error) };
  }
  revalidatePath(`/app/procurement/bills/${billId}`);
  revalidatePath("/app/procurement/bills");
  return { ok: true };
}

/* ------------------------------------------------------------------ */
/* Bill payments                                                       */
/* ------------------------------------------------------------------ */

export async function recordBillPaymentAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  let allocationsRaw: unknown;
  try {
    allocationsRaw = JSON.parse(String(formData.get("allocations") ?? "[]"));
  } catch {
    return { ok: false, error: "Could not read the payment allocations. Try again." };
  }

  const parsed = recordBillPaymentInputSchema.safeParse({
    partnerId: formData.get("partnerId"),
    amount: Number(formData.get("amount")),
    method: formData.get("method") || "bank_transfer",
    reference: formData.get("reference") || null,
    paymentDate: formData.get("paymentDate") || undefined,
    notes: formData.get("notes") || null,
    allocations: allocationsRaw,
  });
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsOf(parsed.error) };

  let paymentId: string;
  try {
    const ctx = await requireContext();
    paymentId = await recordBillPayment(ctx, parsed.data);
  } catch (error) {
    return { ok: false, error: describeError(error) };
  }

  revalidatePath("/app/procurement/payments");
  revalidatePath("/app/procurement/bills");
  return { ok: true, id: paymentId };
}

export async function allocateBillPaymentAction(paymentId: string, allocations: unknown): Promise<ActionResult> {
  const parsed = allocateBillPaymentInputSchema.safeParse({ allocations });
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsOf(parsed.error) };

  try {
    const ctx = await requireContext();
    await allocateBillPayment(ctx, paymentId, parsed.data);
  } catch (error) {
    return { ok: false, error: describeError(error) };
  }
  revalidatePath(`/app/procurement/payments/${paymentId}`);
  revalidatePath("/app/procurement/bills");
  return { ok: true };
}

export async function getOpenBillsForPartnerAction(partnerId: string) {
  const ctx = await requireContext();
  return getOpenBillsForPartner(ctx, partnerId);
}
