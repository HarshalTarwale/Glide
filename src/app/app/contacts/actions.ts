"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireContext } from "@/server/context";
import { PermissionError } from "@/lib/auth/permissions";
import {
  createPartner,
  updatePartner,
  archivePartner,
  partnerInputSchema,
} from "@/server/core/partners";

export interface ActionResult {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
}

const formSchema = partnerInputSchema.extend({
  paymentTermDays: z.coerce.number().int().min(0).max(365),
  creditLimit: z.coerce.number().min(0).nullish(),
});

function parseForm(formData: FormData) {
  const raw = Object.fromEntries(formData.entries());
  return formSchema.safeParse({
    code: raw.code || null,
    name: raw.name,
    kind: raw.kind,
    isCustomer: raw.isCustomer === "on",
    isSupplier: raw.isSupplier === "on",
    email: raw.email || null,
    phone: raw.phone || null,
    currency: raw.currency || null,
    paymentTermDays: raw.paymentTermDays || 0,
    creditLimit: raw.creditLimit || null,
    notes: raw.notes || null,
    billingLine1: raw.billingLine1 || null,
    billingCity: raw.billingCity || null,
    billingRegion: raw.billingRegion || null,
    billingCountry: raw.billingCountry || null,
    billingPostalCode: raw.billingPostalCode || null,
    taxId: raw.taxId || null,
    taxIdCountry: raw.taxIdCountry || null,
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

export async function createPartnerAction(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const parsed = parseForm(formData);
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsOf(parsed.error) };

  try {
    const ctx = await requireContext();
    await createPartner(ctx, parsed.data);
  } catch (error) {
    return { ok: false, error: describeError(error) };
  }

  revalidatePath("/app/contacts");
  return { ok: true };
}

export async function updatePartnerAction(
  id: string,
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const parsed = parseForm(formData);
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsOf(parsed.error) };

  try {
    const ctx = await requireContext();
    await updatePartner(ctx, id, parsed.data);
  } catch (error) {
    return { ok: false, error: describeError(error) };
  }

  revalidatePath("/app/contacts");
  return { ok: true };
}

export async function archivePartnerAction(id: string): Promise<ActionResult> {
  try {
    const ctx = await requireContext();
    await archivePartner(ctx, id);
  } catch (error) {
    return { ok: false, error: describeError(error) };
  }

  revalidatePath("/app/contacts");
  return { ok: true };
}

function describeError(error: unknown): string {
  if (error instanceof PermissionError) return "You do not have permission to do that.";
  return "Something went wrong. Try again.";
}
