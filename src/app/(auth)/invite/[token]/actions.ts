"use server";

import { redirect } from "next/navigation";
import { auth, signIn } from "@/lib/auth/auth";
import { acceptInvitation } from "@/server/core/invitations";

export interface AcceptFormState {
  error?: string;
  fieldErrors?: Record<string, string>;
}

/** The new-account path: the invited email has no Glide account yet. */
export async function acceptNewAccountAction(
  token: string,
  _prev: AcceptFormState,
  formData: FormData
): Promise<AcceptFormState> {
  const name = String(formData.get("name") ?? "");
  const password = String(formData.get("password") ?? "");

  const result = await acceptInvitation(token, { name, password });
  if (!result.ok) return { error: result.error };

  await signIn("credentials", { email: formData.get("email"), password, redirect: false });
  redirect("/app");
}

/**
 * The existing-account path: the invited email already has a Glide
 * account. Deliberately re-checks the SESSION here, server-side, rather
 * than trusting that the page only rendered this button for a matching
 * session -- acceptInvitation() itself has no password to verify on this
 * path (there's nothing in the form to check), so the session check here
 * IS the only thing standing between "I have this link" and "I can attach
 * a stranger's existing account to my tenant." Never relax this to "the UI
 * already hid the button for anyone else."
 */
export async function acceptExistingAccountAction(token: string, invitedEmail: string): Promise<AcceptFormState> {
  const session = await auth();
  if (!session?.user?.email) {
    return { error: "Sign in first, then come back to this link." };
  }
  if (session.user.email.toLowerCase() !== invitedEmail.toLowerCase()) {
    return { error: `You're signed in as ${session.user.email}, but this invitation is for ${invitedEmail}. Sign out and sign in as ${invitedEmail} to accept it.` };
  }

  const result = await acceptInvitation(token, {});
  if (!result.ok) return { error: result.error };

  redirect("/app");
}
