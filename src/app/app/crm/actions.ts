"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireContext } from "@/server/context";
import { PermissionError } from "@/lib/auth/permissions";
import { createLead, setLeadStatus, convertLead, leadInputSchema, convertLeadInputSchema } from "@/server/crm/leads";
import { createOpportunity, changeStage, opportunityInputSchema } from "@/server/crm/opportunities";
import { createActivity, setActivityDone, activityInputSchema } from "@/server/crm/activities";

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

export async function createLeadAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const parsed = leadInputSchema.safeParse({
    name: formData.get("name"),
    companyName: formData.get("companyName") || null,
    email: formData.get("email") || null,
    phone: formData.get("phone") || null,
    source: formData.get("source") || "other",
    notes: formData.get("notes") || null,
  });
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsOf(parsed.error) };

  let leadId: string;
  try {
    const ctx = await requireContext();
    leadId = await createLead(ctx, parsed.data);
  } catch (error) {
    return { ok: false, error: describeError(error) };
  }

  revalidatePath("/app/crm/leads");
  redirect(`/app/crm/leads/${leadId}`);
}

export async function setLeadStatusAction(leadId: string, status: string): Promise<ActionResult> {
  try {
    const ctx = await requireContext();
    await setLeadStatus(ctx, leadId, status);
  } catch (error) {
    return { ok: false, error: describeError(error) };
  }
  revalidatePath(`/app/crm/leads/${leadId}`);
  revalidatePath("/app/crm/leads");
  return { ok: true };
}

export async function convertLeadAction(
  leadId: string,
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const parsed = convertLeadInputSchema.safeParse({
    createOpportunity: formData.get("createOpportunity") === "on",
    opportunityName: formData.get("opportunityName") || null,
    expectedValue: Number(formData.get("expectedValue") ?? 0),
    expectedCloseDate: formData.get("expectedCloseDate") || null,
  });
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsOf(parsed.error) };

  let result: { partnerId: string; opportunityId: string | null };
  try {
    const ctx = await requireContext();
    result = await convertLead(ctx, leadId, parsed.data);
  } catch (error) {
    return { ok: false, error: describeError(error) };
  }

  revalidatePath("/app/crm/leads");
  revalidatePath("/app/crm/pipeline");
  redirect(result.opportunityId ? `/app/crm/pipeline/${result.opportunityId}` : `/app/contacts/${result.partnerId}`);
}

export async function createOpportunityAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const parsed = opportunityInputSchema.safeParse({
    name: formData.get("name"),
    partnerId: formData.get("partnerId"),
    expectedValue: Number(formData.get("expectedValue") ?? 0),
    expectedCloseDate: formData.get("expectedCloseDate") || null,
    notes: formData.get("notes") || null,
  });
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsOf(parsed.error) };

  let opportunityId: string;
  try {
    const ctx = await requireContext();
    opportunityId = await createOpportunity(ctx, parsed.data);
  } catch (error) {
    return { ok: false, error: describeError(error) };
  }

  revalidatePath("/app/crm/pipeline");
  redirect(`/app/crm/pipeline/${opportunityId}`);
}

export async function changeStageAction(opportunityId: string, stage: string, lostReason?: string | null): Promise<ActionResult> {
  try {
    const ctx = await requireContext();
    await changeStage(ctx, opportunityId, { stage, lostReason });
  } catch (error) {
    return { ok: false, error: describeError(error) };
  }
  revalidatePath("/app/crm/pipeline");
  revalidatePath(`/app/crm/pipeline/${opportunityId}`);
  return { ok: true };
}

export async function createActivityAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const parsed = activityInputSchema.safeParse({
    type: formData.get("type"),
    subject: formData.get("subject"),
    dueDate: formData.get("dueDate") || null,
    leadId: formData.get("leadId") || null,
    opportunityId: formData.get("opportunityId") || null,
    partnerId: formData.get("partnerId") || null,
    notes: formData.get("notes") || null,
  });
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsOf(parsed.error) };

  try {
    const ctx = await requireContext();
    await createActivity(ctx, parsed.data);
  } catch (error) {
    return { ok: false, error: describeError(error) };
  }

  if (parsed.data.leadId) revalidatePath(`/app/crm/leads/${parsed.data.leadId}`);
  if (parsed.data.opportunityId) revalidatePath(`/app/crm/pipeline/${parsed.data.opportunityId}`);
  return { ok: true };
}

export async function setActivityDoneAction(activityId: string, isDone: boolean, relatedPath: string): Promise<ActionResult> {
  try {
    const ctx = await requireContext();
    await setActivityDone(ctx, activityId, isDone);
  } catch (error) {
    return { ok: false, error: describeError(error) };
  }
  revalidatePath(relatedPath);
  return { ok: true };
}
