"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireContext } from "@/server/context";
import { PermissionError } from "@/lib/auth/permissions";
import { createAccount, updateAccount, deactivateAccount, ledgerAccountInputSchema } from "@/server/accounting/accounts";
import {
  createJournalEntry,
  updateJournalEntryLines,
  postJournalEntry,
  deleteJournalEntry,
  createJournalEntryInputSchema,
} from "@/server/accounting/journal-entries";

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

function parseAccountForm(formData: FormData) {
  return ledgerAccountInputSchema.safeParse({
    code: formData.get("code"),
    name: formData.get("name"),
    type: formData.get("type"),
    isActive: formData.get("isActive") === "on",
  });
}

export async function createAccountAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const parsed = parseAccountForm(formData);
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsOf(parsed.error) };

  try {
    const ctx = await requireContext();
    await createAccount(ctx, parsed.data);
  } catch (error) {
    return { ok: false, error: describeError(error) };
  }
  revalidatePath("/app/accounting/accounts");
  return { ok: true };
}

export async function updateAccountAction(id: string, _prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const parsed = parseAccountForm(formData);
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsOf(parsed.error) };

  try {
    const ctx = await requireContext();
    await updateAccount(ctx, id, parsed.data);
  } catch (error) {
    return { ok: false, error: describeError(error) };
  }
  revalidatePath("/app/accounting/accounts");
  return { ok: true };
}

export async function deactivateAccountAction(id: string): Promise<ActionResult> {
  try {
    const ctx = await requireContext();
    await deactivateAccount(ctx, id);
  } catch (error) {
    return { ok: false, error: describeError(error) };
  }
  revalidatePath("/app/accounting/accounts");
  return { ok: true };
}

export async function createJournalEntryAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  let linesRaw: unknown;
  try {
    linesRaw = JSON.parse(String(formData.get("lines") ?? "[]"));
  } catch {
    return { ok: false, error: "Could not read the journal entry lines. Try again." };
  }

  const parsed = createJournalEntryInputSchema.safeParse({
    date: formData.get("date"),
    description: formData.get("description"),
    lines: linesRaw,
  });
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsOf(parsed.error) };

  let entryId: string;
  try {
    const ctx = await requireContext();
    entryId = await createJournalEntry(ctx, parsed.data);
  } catch (error) {
    return { ok: false, error: describeError(error) };
  }

  revalidatePath("/app/accounting/journal");
  redirect(`/app/accounting/journal/${entryId}`);
}

export async function updateJournalEntryLinesAction(entryId: string, formData: FormData): Promise<ActionResult> {
  let linesRaw: unknown;
  try {
    linesRaw = JSON.parse(String(formData.get("lines") ?? "[]"));
  } catch {
    return { ok: false, error: "Could not read the journal entry lines. Try again." };
  }

  const parsed = createJournalEntryInputSchema.safeParse({
    date: formData.get("date"),
    description: formData.get("description"),
    lines: linesRaw,
  });
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsOf(parsed.error) };

  try {
    const ctx = await requireContext();
    await updateJournalEntryLines(ctx, entryId, parsed.data);
  } catch (error) {
    return { ok: false, error: describeError(error) };
  }
  revalidatePath(`/app/accounting/journal/${entryId}`);
  return { ok: true };
}

export async function postJournalEntryAction(entryId: string): Promise<ActionResult> {
  try {
    const ctx = await requireContext();
    await postJournalEntry(ctx, entryId);
  } catch (error) {
    return { ok: false, error: describeError(error) };
  }
  revalidatePath(`/app/accounting/journal/${entryId}`);
  revalidatePath("/app/accounting/journal");
  revalidatePath("/app/reports");
  return { ok: true };
}

export async function deleteJournalEntryAction(entryId: string): Promise<ActionResult> {
  try {
    const ctx = await requireContext();
    await deleteJournalEntry(ctx, entryId);
  } catch (error) {
    return { ok: false, error: describeError(error) };
  }
  revalidatePath("/app/accounting/journal");
  return { ok: true };
}
