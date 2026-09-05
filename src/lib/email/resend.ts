import "server-only";

/**
 * Thin wrapper over Resend's REST API -- plain `fetch` against a single
 * POST endpoint, not the `resend` npm package: adding a dependency for
 * one HTTP call isn't worth it.
 *
 * Callers must decide for themselves whether a failed send is fatal to
 * their own flow. Invitations, in particular, treat this as best-effort:
 * the copyable invite link is always shown regardless of whether the
 * email went out, so a Resend outage or a bad API key never blocks
 * inviting someone.
 */

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
}

export function isEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}

export async function sendEmail(input: SendEmailInput): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) {
    throw new Error("Email is not configured -- set RESEND_API_KEY and EMAIL_FROM.");
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: input.to, subject: input.subject, html: input.html }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Resend API error (${response.status}): ${body}`);
  }
}
