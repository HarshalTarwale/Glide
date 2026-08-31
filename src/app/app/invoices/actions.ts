"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireContext } from "@/server/context";
import { PermissionError } from "@/lib/auth/permissions";
import {
  createStandaloneInvoice,
  createInvoiceFromOrder,
  updateInvoiceLines,
  postInvoice,
  cancelInvoice,
  createStandaloneInvoiceInputSchema,
  createInvoiceFromOrderInputSchema,
  listOpenInvoicesForPartner,
  type OpenInvoiceDTO,
} from "@/server/invoicing/invoices";
import { createCreditNote, createCreditNoteInputSchema } from "@/server/invoicing/credit-notes";
import { recordPayment, allocatePayment, recordPaymentInputSchema, allocatePaymentInputSchema } from "@/server/invoicing/payments";

export interface ActionResult {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
  /** Set by actions a caller may need to navigate to on success without a server-side redirect (e.g. from a dialog). */
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

/**
 * Same shape as sales/actions.ts's createSalesOrderAction: the dynamic-length
 * `lines` array is serialised into one hidden JSON field, since a native
 * <form> has no repeating-group primitive.
 */
export async function createStandaloneInvoiceAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  let linesRaw: unknown;
  try {
    linesRaw = JSON.parse(String(formData.get("lines") ?? "[]"));
  } catch {
    return { ok: false, error: "Could not read the invoice lines. Try again." };
  }

  const parsed = createStandaloneInvoiceInputSchema.safeParse({
    partnerId: formData.get("partnerId"),
    dueDate: formData.get("dueDate") || null,
    notes: formData.get("notes") || null,
    lines: linesRaw,
  });
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsOf(parsed.error) };

  let invoiceId: string;
  try {
    const ctx = await requireContext();
    invoiceId = await createStandaloneInvoice(ctx, parsed.data);
  } catch (error) {
    return { ok: false, error: describeError(error) };
  }

  revalidatePath("/app/invoices");
  redirect(`/app/invoices/${invoiceId}`);
}

export async function createInvoiceFromOrderAction(
  orderId: string,
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  let linesRaw: unknown;
  try {
    linesRaw = JSON.parse(String(formData.get("lines") ?? "[]"));
  } catch {
    return { ok: false, error: "Could not read the invoice lines. Try again." };
  }

  const parsed = createInvoiceFromOrderInputSchema.safeParse({
    dueDate: formData.get("dueDate") || null,
    notes: formData.get("notes") || null,
    lines: linesRaw,
  });
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsOf(parsed.error) };

  let invoiceId: string;
  try {
    const ctx = await requireContext();
    invoiceId = await createInvoiceFromOrder(ctx, orderId, parsed.data);
  } catch (error) {
    return { ok: false, error: describeError(error) };
  }

  revalidatePath(`/app/sales/${orderId}`);
  revalidatePath("/app/invoices");
  redirect(`/app/invoices/${invoiceId}`);
}

export async function updateInvoiceLinesAction(invoiceId: string, lines: unknown): Promise<ActionResult> {
  const parsed = z.object({ lines: createStandaloneInvoiceInputSchema.shape.lines }).safeParse({ lines });
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsOf(parsed.error) };

  try {
    const ctx = await requireContext();
    await updateInvoiceLines(ctx, invoiceId, parsed.data);
  } catch (error) {
    return { ok: false, error: describeError(error) };
  }
  revalidatePath(`/app/invoices/${invoiceId}`);
  return { ok: true };
}

export async function postInvoiceAction(invoiceId: string): Promise<ActionResult> {
  try {
    const ctx = await requireContext();
    await postInvoice(ctx, invoiceId);
  } catch (error) {
    return { ok: false, error: describeError(error) };
  }
  revalidatePath(`/app/invoices/${invoiceId}`);
  revalidatePath("/app/invoices");
  return { ok: true };
}

export async function cancelInvoiceAction(invoiceId: string): Promise<ActionResult> {
  try {
    const ctx = await requireContext();
    await cancelInvoice(ctx, invoiceId);
  } catch (error) {
    return { ok: false, error: describeError(error) };
  }
  revalidatePath(`/app/invoices/${invoiceId}`);
  revalidatePath("/app/invoices");
  return { ok: true };
}

export async function createCreditNoteAction(
  invoiceId: string,
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  let linesRaw: unknown;
  try {
    linesRaw = JSON.parse(String(formData.get("lines") ?? "[]"));
  } catch {
    return { ok: false, error: "Could not read the credit note lines. Try again." };
  }

  const parsed = createCreditNoteInputSchema.safeParse({
    reason: formData.get("reason"),
    lines: linesRaw,
  });
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsOf(parsed.error) };

  try {
    const ctx = await requireContext();
    await createCreditNote(ctx, invoiceId, parsed.data);
  } catch (error) {
    return { ok: false, error: describeError(error) };
  }

  revalidatePath(`/app/invoices/${invoiceId}`);
  return { ok: true };
}

/**
 * Deliberately does NOT redirect: used both from a dialog on the invoice
 * record page (which must stay put and just refresh) and from the
 * standalone /app/payments/new page (which navigates itself using the
 * returned `id`, the same reason ActionResult carries one).
 */
export async function recordPaymentAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  let allocationsRaw: unknown;
  try {
    allocationsRaw = JSON.parse(String(formData.get("allocations") ?? "[]"));
  } catch {
    return { ok: false, error: "Could not read the payment allocations. Try again." };
  }

  const parsed = recordPaymentInputSchema.safeParse({
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
    paymentId = await recordPayment(ctx, parsed.data);
  } catch (error) {
    return { ok: false, error: describeError(error) };
  }

  revalidatePath("/app/payments");
  revalidatePath("/app/invoices");
  return { ok: true, id: paymentId };
}

export async function allocatePaymentAction(paymentId: string, allocations: unknown): Promise<ActionResult> {
  const parsed = allocatePaymentInputSchema.safeParse({ allocations });
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsOf(parsed.error) };

  try {
    const ctx = await requireContext();
    await allocatePayment(ctx, paymentId, parsed.data);
  } catch (error) {
    return { ok: false, error: describeError(error) };
  }
  revalidatePath(`/app/payments/${paymentId}`);
  revalidatePath("/app/invoices");
  return { ok: true };
}

/** Powers the customer picker on /app/payments/new: which invoices become allocatable once a partner is chosen. */
export async function getOpenInvoicesForPartnerAction(partnerId: string): Promise<OpenInvoiceDTO[]> {
  const ctx = await requireContext();
  return listOpenInvoicesForPartner(ctx, partnerId);
}
