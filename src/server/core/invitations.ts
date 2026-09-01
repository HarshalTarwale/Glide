import "server-only";

import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { withTenant, withInviteToken } from "@/lib/db/tenant-client";
import { assertPermission } from "@/lib/auth/permissions";
import type { RequestContext } from "@/server/context";

/**
 * Invitations: the "not a member yet" half of team management (members.ts
 * covers who's already in). No email delivery yet -- see
 * docs/roadmap.md's P5 section -- inviteMember() returns the token, and
 * the caller (a Server Action) turns it into a link to copy and send
 * however they currently reach that person. Wiring an email provider
 * later is a change to the ACTION, not to this service.
 */

export interface InvitationDTO {
  id: string;
  email: string;
  roleIds: string[];
  roleNames: string[];
  token: string;
  expiresAt: string;
  createdAt: string;
}

const INVITATION_TTL_DAYS = 7;

export const inviteMemberInputSchema = z.object({
  email: z.email("Enter a valid email address"),
  roleIds: z.array(z.uuid()).min(1, "Pick at least one role"),
});
export type InviteMemberInput = z.infer<typeof inviteMemberInputSchema>;

export async function inviteMember(ctx: RequestContext, input: InviteMemberInput): Promise<{ token: string }> {
  assertPermission(ctx.permissions, "core:member:invite");
  const data = inviteMemberInputSchema.parse(input);

  return withTenant(ctx.tenantId, async (tx) => {
    const roles = await tx.role.findMany({ where: { id: { in: data.roleIds }, tenantId: ctx.tenantId } });
    if (roles.length !== data.roleIds.length) {
      throw new Error("One or more selected roles do not exist.");
    }

    const existingUser = await prisma.user.findUnique({ where: { email: data.email }, select: { id: true } });
    if (existingUser) {
      const existingMembership = await tx.membership.findUnique({
        where: { tenantId_userId: { tenantId: ctx.tenantId, userId: existingUser.id } },
      });
      if (existingMembership) {
        throw new Error(`${data.email} is already a member of this organisation.`);
      }
    }

    const token = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + INVITATION_TTL_DAYS * 24 * 60 * 60 * 1000);

    // Upsert on the (tenantId, email) unique constraint -- re-inviting the
    // same address (a lost link, an expired one, a role change before they
    // accepted) issues a fresh token rather than erroring on the duplicate.
    const invitation = await tx.invitation.upsert({
      where: { tenantId_email: { tenantId: ctx.tenantId, email: data.email } },
      update: { roleIds: data.roleIds, token, expiresAt, acceptedAt: null, createdBy: ctx.userId },
      create: { tenantId: ctx.tenantId, email: data.email, roleIds: data.roleIds, token, expiresAt, createdBy: ctx.userId },
    });

    await tx.auditLog.create({
      data: {
        tenantId: ctx.tenantId,
        entityType: "Invitation",
        entityId: invitation.id,
        action: "invited",
        actorId: ctx.userId,
        actorName: ctx.userName,
        changes: { email: { from: null, to: data.email } },
      },
    });

    return { token };
  });
}

export async function listPendingInvitations(ctx: RequestContext): Promise<InvitationDTO[]> {
  assertPermission(ctx.permissions, "core:member:read");

  return withTenant(ctx.tenantId, async (tx) => {
    const rows = await tx.invitation.findMany({
      where: { tenantId: ctx.tenantId, acceptedAt: null },
      orderBy: { createdAt: "desc" },
    });
    const roleIds = [...new Set(rows.flatMap((r) => r.roleIds))];
    const roles = roleIds.length ? await tx.role.findMany({ where: { id: { in: roleIds } } }) : [];
    const roleNameById = new Map(roles.map((r) => [r.id, r.name]));

    return rows.map((r) => ({
      id: r.id,
      email: r.email,
      roleIds: r.roleIds,
      roleNames: r.roleIds.map((id) => roleNameById.get(id) ?? "Unknown role"),
      token: r.token,
      expiresAt: r.expiresAt.toISOString(),
      createdAt: r.createdAt.toISOString(),
    }));
  });
}

export async function revokeInvitation(ctx: RequestContext, invitationId: string): Promise<void> {
  assertPermission(ctx.permissions, "core:member:invite");

  await withTenant(ctx.tenantId, async (tx) => {
    await tx.invitation.delete({ where: { id: invitationId } });
  });
}

/* ------------------------------------------------------------------ */
/* The public accept flow -- no session, no tenant context yet.        */
/* ------------------------------------------------------------------ */

export interface InvitationPreviewDTO {
  tenantName: string;
  email: string;
  roleNames: string[];
  /** Whether a Glide account already exists for this email -- decides which form the accept page shows. */
  hasExistingAccount: boolean;
}

type InvitationRow = NonNullable<Awaited<ReturnType<typeof fetchInvitationRow>>>;

function fetchInvitationRow(token: string) {
  return withInviteToken(token, (tx) => tx.invitation.findFirst({ where: { token }, include: { tenant: true } }));
}

type LoadInvitationResult = { ok: true; invitation: InvitationRow } | { ok: false; error: string };

async function loadInvitationByToken(token: string): Promise<LoadInvitationResult> {
  const invitation = await fetchInvitationRow(token);
  if (!invitation) return { ok: false, error: "This invitation link is invalid." };
  if (invitation.acceptedAt) return { ok: false, error: "This invitation has already been used." };
  if (invitation.expiresAt < new Date()) return { ok: false, error: "This invitation has expired -- ask whoever sent it for a new one." };
  return { ok: true, invitation };
}

export async function getInvitationPreview(token: string): Promise<InvitationPreviewDTO | { error: string }> {
  const result = await loadInvitationByToken(token);
  if (!result.ok) return { error: result.error };
  const { invitation } = result;

  const [roles, existingUser] = await Promise.all([
    withTenant(invitation.tenantId, (tx) => tx.role.findMany({ where: { id: { in: invitation.roleIds } } })),
    prisma.user.findUnique({ where: { email: invitation.email }, select: { id: true } }),
  ]);

  return {
    tenantName: invitation.tenant.name,
    email: invitation.email,
    roleNames: roles.map((r) => r.name),
    hasExistingAccount: Boolean(existingUser),
  };
}

const acceptNewAccountSchema = z.object({
  name: z.string().min(1, "Your name is required").max(120),
  password: z.string().min(8, "Use at least 8 characters").max(200),
});

/**
 * Accepts an invitation. For a brand-new email, creates the User (mirrors
 * signup.ts's own user-creation exactly) -- for an email that already has
 * a Glide account, `input` is ignored and the caller is expected to have
 * verified that a session already exists for that email (see the accept
 * page/action) before calling this.
 */
export async function acceptInvitation(
  token: string,
  input: { name?: string; password?: string }
): Promise<{ ok: true; userId: string; tenantId: string } | { ok: false; error: string }> {
  const result = await loadInvitationByToken(token);
  if (!result.ok) return { ok: false, error: result.error };
  const { invitation } = result;

  let user = await prisma.user.findUnique({ where: { email: invitation.email } });
  if (!user) {
    const parsed = acceptNewAccountSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? "Enter your name and a password." };
    }
    user = await prisma.user.create({
      data: {
        email: invitation.email,
        name: parsed.data.name,
        passwordHash: await bcrypt.hash(parsed.data.password, 12),
      },
    });
  }

  try {
    await withTenant(invitation.tenantId, async (tx) => {
      const existingMembership = await tx.membership.findUnique({
        where: { tenantId_userId: { tenantId: invitation.tenantId, userId: user!.id } },
      });
      if (existingMembership) {
        throw new Error("You're already a member of this organisation.");
      }

      const membership = await tx.membership.create({
        data: { tenantId: invitation.tenantId, userId: user!.id, isOwner: false },
      });
      await tx.membershipRole.createMany({
        data: invitation.roleIds.map((roleId) => ({ membershipId: membership.id, roleId })),
      });
      await tx.invitation.update({ where: { id: invitation.id }, data: { acceptedAt: new Date() } });

      await tx.auditLog.create({
        data: {
          tenantId: invitation.tenantId,
          entityType: "Membership",
          entityId: membership.id,
          action: "joined",
          actorId: user!.id,
          actorName: user!.name ?? user!.email,
        },
      });
    });
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not accept the invitation." };
  }

  return { ok: true, userId: user.id, tenantId: invitation.tenantId };
}
