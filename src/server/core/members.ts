import "server-only";

import { z } from "zod";
import { withTenant } from "@/lib/db/tenant-client";
import { assertPermission } from "@/lib/auth/permissions";
import type { RequestContext } from "@/server/context";

/**
 * Member management: who's actually IN a tenant, and what roles they hold.
 * The counterpart to invitations.ts (who's been invited but hasn't joined
 * yet). Split into two files because the RLS/identity story differs --
 * everything here runs under a normal, already-established tenant context,
 * where invitations.ts's accept path has to bootstrap identity from a
 * token before one exists.
 */

export interface MemberDTO {
  membershipId: string;
  userId: string;
  name: string;
  email: string;
  isOwner: boolean;
  roleIds: string[];
  roleNames: string[];
  joinedAt: string;
}

export async function listMembers(ctx: RequestContext): Promise<MemberDTO[]> {
  assertPermission(ctx.permissions, "core:member:read");

  return withTenant(ctx.tenantId, async (tx) => {
    const rows = await tx.membership.findMany({
      where: { tenantId: ctx.tenantId },
      include: { user: true, roles: { include: { role: true } } },
      orderBy: { createdAt: "asc" },
    });

    return rows.map((m) => ({
      membershipId: m.id,
      userId: m.userId,
      name: m.user.name ?? m.user.email,
      email: m.user.email,
      isOwner: m.isOwner,
      roleIds: m.roles.map((r) => r.roleId),
      roleNames: m.roles.map((r) => r.role.name),
      joinedAt: m.createdAt.toISOString(),
    }));
  });
}

export const updateMemberRolesInputSchema = z.object({
  roleIds: z.array(z.uuid()).min(1, "Every member needs at least one role"),
});
export type UpdateMemberRolesInput = z.infer<typeof updateMemberRolesInputSchema>;

/**
 * Gated on core:member:invite (not a dedicated permission) -- deciding who
 * gets which role is the same responsibility as deciding who joins in the
 * first place, and the roles that can invite (Owner, Administrator) are
 * exactly the ones that should be able to re-assign roles too. Introducing
 * a fifth permission string for this would split one responsibility across
 * two gates for no real access-control benefit.
 */
export async function updateMemberRoles(
  ctx: RequestContext,
  membershipId: string,
  input: UpdateMemberRolesInput
): Promise<void> {
  assertPermission(ctx.permissions, "core:member:invite");
  const data = updateMemberRolesInputSchema.parse(input);

  await withTenant(ctx.tenantId, async (tx) => {
    const membership = await tx.membership.findUniqueOrThrow({ where: { id: membershipId } });
    if (membership.isOwner) {
      throw new Error("The organisation owner's roles cannot be changed.");
    }

    const roles = await tx.role.findMany({ where: { id: { in: data.roleIds }, tenantId: ctx.tenantId } });
    if (roles.length !== data.roleIds.length) {
      throw new Error("One or more selected roles do not exist.");
    }

    await tx.membershipRole.deleteMany({ where: { membershipId } });
    await tx.membershipRole.createMany({ data: data.roleIds.map((roleId) => ({ membershipId, roleId })) });

    await tx.auditLog.create({
      data: {
        tenantId: ctx.tenantId,
        entityType: "Membership",
        entityId: membershipId,
        action: "roles_updated",
        actorId: ctx.userId,
        actorName: ctx.userName,
        changes: { roleIds: { from: null, to: data.roleIds.join(", ") } },
      },
    });
  });
}

export async function removeMember(ctx: RequestContext, membershipId: string): Promise<void> {
  assertPermission(ctx.permissions, "core:member:remove");

  await withTenant(ctx.tenantId, async (tx) => {
    const membership = await tx.membership.findUniqueOrThrow({ where: { id: membershipId } });
    if (membership.isOwner) {
      throw new Error("The organisation owner cannot be removed.");
    }
    if (membership.userId === ctx.userId) {
      throw new Error("You cannot remove your own membership.");
    }

    // MembershipRole rows cascade with the membership itself (schema's
    // onDelete: Cascade on both sides of that join table).
    await tx.membership.delete({ where: { id: membershipId } });

    await tx.auditLog.create({
      data: {
        tenantId: ctx.tenantId,
        entityType: "Membership",
        entityId: membershipId,
        action: "removed",
        actorId: ctx.userId,
        actorName: ctx.userName,
      },
    });
  });
}
