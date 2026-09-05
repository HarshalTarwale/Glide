/**
 * Plain HTML email bodies, inline-styled (email clients don't reliably
 * load external stylesheets). No templating engine -- one function per
 * email, each returning a self-contained string, which is all this
 * product needs so far.
 */

export function invitationEmailHtml(input: { tenantName: string; inviterName: string; roleNames: string[]; link: string }): string {
  const roles = input.roleNames.join(", ");
  return `
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px; color: #0A0A0A;">
  <p style="font-size: 20px; font-weight: 600; margin: 0 0 24px;">Glide</p>
  <p style="font-size: 15px; line-height: 1.6; margin: 0 0 16px;">
    ${escapeHtml(input.inviterName)} has invited you to join <strong>${escapeHtml(input.tenantName)}</strong> on Glide${roles ? ` as ${escapeHtml(roles)}` : ""}.
  </p>
  <p style="margin: 24px 0;">
    <a href="${input.link}" style="display: inline-block; background: #0A0A0A; color: #FFFFFF; text-decoration: none; padding: 10px 20px; border-radius: 6px; font-size: 14px; font-weight: 500;">
      Accept invitation
    </a>
  </p>
  <p style="font-size: 13px; color: #6B6B66; line-height: 1.6; margin: 0 0 8px;">
    This link is valid for 7 days. If the button doesn't work, copy this URL into your browser:
  </p>
  <p style="font-size: 12px; color: #6B6B66; word-break: break-all; margin: 0;">${input.link}</p>
</div>`.trim();
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);
}
