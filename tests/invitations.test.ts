import { afterAll, describe, expect, it } from "vitest";
import { signup } from "@/server/core/signup";
import { withTenant } from "@/lib/db/tenant-client";
import {
  inviteMember,
  listPendingInvitations,
  revokeInvitation,
  getInvitationPreview,
  acceptInvitation,
} from "@/server/core/invitations";
import { listMembers, updateMemberRoles, removeMember } from "@/server/core/members";
import type { RequestContext } from "@/server/context";
import { unionPermissions } from "@/lib/auth/permissions";

/**
 * P5's "onboarding flow" gap, closed: a real, working member-invitation
 * mechanism (email delivery deferred -- see docs/roadmap.md -- but the
 * actual invite/accept/manage machinery is real and this proves it end to
 * end against live Neon).
 */

const hasDatabase =
  Boolean(process.env.DATABASE_URL) && !process.env.DATABASE_URL?.includes("placeholder");
const describeWithDb = hasDatabase ? describe : describe.skip;

async function makeOwnerContext(orgName: string) {
  const result = await signup({
    name: "Test Owner",
    email: `invite-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`,
    password: "password123",
    organisation: orgName,
    country: "IN",
  });
  if (!result.ok) throw new Error(result.error);

  return withTenant(result.tenantId, async (tx) => {
    const membership = await tx.membership.findFirstOrThrow({
      where: { tenantId: result.tenantId, userId: result.userId },
      include: { roles: { include: { role: true } } },
    });
    const roles = membership.roles.map((r) => r.role);
    const tenant = await tx.tenant.findUniqueOrThrow({ where: { id: result.tenantId } });
    const salesRepRole = await tx.role.findFirstOrThrow({ where: { tenantId: result.tenantId, name: "Sales Representative" } });
    const ctx: RequestContext = {
      userId: result.userId,
      userName: "Test Owner",
      userEmail: "",
      tenantId: result.tenantId,
      tenantName: orgName,
      country: tenant.country,
      currency: tenant.currency,
      isOwner: true,
      permissions: unionPermissions(roles),
      recordScopes: [],
      availableTenants: [],
    };
    return { ctx, salesRepRoleId: salesRepRole.id };
  });
}

describeWithDb("Member invitations", () => {
  const tenantIds: string[] = [];
  const userEmails: string[] = [];
  afterAll(async () => {
    const { prisma } = await import("@/lib/db/client");
    for (const id of tenantIds) await withTenant(id, (tx) => tx.tenant.delete({ where: { id } }));
    for (const email of userEmails) await prisma.user.deleteMany({ where: { email } });
    await prisma.$disconnect();
  });

  it("the full lifecycle: invite -> preview -> accept -> appears as a member with the right role", async () => {
    const { ctx, salesRepRoleId } = await makeOwnerContext("Invite Lifecycle Co");
    tenantIds.push(ctx.tenantId);
    const inviteeEmail = `invitee-${Date.now()}@example.com`;
    userEmails.push(inviteeEmail);

    const { token } = await inviteMember(ctx, { email: inviteeEmail, roleIds: [salesRepRoleId] });
    expect(token).toBeTruthy();

    const pending = await listPendingInvitations(ctx);
    expect(pending.some((i) => i.email === inviteeEmail)).toBe(true);

    const preview = await getInvitationPreview(token);
    if ("error" in preview) throw new Error(`Expected a valid preview, got: ${preview.error}`);
    expect(preview.tenantName).toBe("Invite Lifecycle Co");
    expect(preview.roleNames).toEqual(["Sales Representative"]);
    expect(preview.hasExistingAccount).toBe(false);

    const result = await acceptInvitation(token, { name: "New Teammate", password: "password123" });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    expect(result.tenantId).toBe(ctx.tenantId);

    const members = await listMembers(ctx);
    const newMember = members.find((m) => m.email === inviteeEmail);
    expect(newMember).toBeDefined();
    expect(newMember!.roleNames).toEqual(["Sales Representative"]);
    expect(newMember!.isOwner).toBe(false);

    // The invitation is no longer pending once accepted.
    const pendingAfter = await listPendingInvitations(ctx);
    expect(pendingAfter.some((i) => i.email === inviteeEmail)).toBe(false);
  });

  it("cannot be accepted twice", async () => {
    const { ctx, salesRepRoleId } = await makeOwnerContext("Double Accept Co");
    tenantIds.push(ctx.tenantId);
    const inviteeEmail = `double-${Date.now()}@example.com`;
    userEmails.push(inviteeEmail);

    const { token } = await inviteMember(ctx, { email: inviteeEmail, roleIds: [salesRepRoleId] });
    const first = await acceptInvitation(token, { name: "Once", password: "password123" });
    expect(first.ok).toBe(true);

    const second = await acceptInvitation(token, { name: "Twice", password: "password123" });
    expect(second.ok).toBe(false);
    if (second.ok) throw new Error("unreachable");
    expect(second.error).toMatch(/already been used/);
  });

  it("refuses to invite someone who is already a member", async () => {
    const { ctx, salesRepRoleId } = await makeOwnerContext("Already Member Co");
    tenantIds.push(ctx.tenantId);
    const inviteeEmail = `already-${Date.now()}@example.com`;
    userEmails.push(inviteeEmail);

    const { token } = await inviteMember(ctx, { email: inviteeEmail, roleIds: [salesRepRoleId] });
    await acceptInvitation(token, { name: "Already In", password: "password123" });

    await expect(inviteMember(ctx, { email: inviteeEmail, roleIds: [salesRepRoleId] })).rejects.toThrow(/already a member/);
  });

  it("re-inviting the same address issues a fresh token", async () => {
    const { ctx, salesRepRoleId } = await makeOwnerContext("Reinvite Co");
    tenantIds.push(ctx.tenantId);
    const inviteeEmail = `reinvite-${Date.now()}@example.com`;

    const first = await inviteMember(ctx, { email: inviteeEmail, roleIds: [salesRepRoleId] });
    const second = await inviteMember(ctx, { email: inviteeEmail, roleIds: [salesRepRoleId] });
    expect(second.token).not.toBe(first.token);

    const pending = await listPendingInvitations(ctx);
    const matching = pending.filter((i) => i.email === inviteeEmail);
    // The upsert replaces the row rather than creating a second one.
    expect(matching).toHaveLength(1);
    expect(matching[0].token).toBe(second.token);
  });

  it("revoking a pending invitation removes it, and its old token no longer resolves", async () => {
    const { ctx, salesRepRoleId } = await makeOwnerContext("Revoke Co");
    tenantIds.push(ctx.tenantId);
    const inviteeEmail = `revoke-${Date.now()}@example.com`;

    const { token } = await inviteMember(ctx, { email: inviteeEmail, roleIds: [salesRepRoleId] });
    const pending = await listPendingInvitations(ctx);
    const invitation = pending.find((i) => i.email === inviteeEmail)!;

    await revokeInvitation(ctx, invitation.id);

    const preview = await getInvitationPreview(token);
    expect("error" in preview).toBe(true);
  });

  it("a token from one tenant cannot be used to read another tenant's invitation list", async () => {
    const { ctx: ctxA, salesRepRoleId } = await makeOwnerContext("Isolation Tenant A");
    const { ctx: ctxB } = await makeOwnerContext("Isolation Tenant B");
    tenantIds.push(ctxA.tenantId, ctxB.tenantId);

    await inviteMember(ctxA, { email: `iso-${Date.now()}@example.com`, roleIds: [salesRepRoleId] });

    const pendingForB = await listPendingInvitations(ctxB);
    expect(pendingForB).toHaveLength(0);
  });
});

describeWithDb("Member management", () => {
  const tenantIds: string[] = [];
  const userEmails: string[] = [];
  afterAll(async () => {
    const { prisma } = await import("@/lib/db/client");
    for (const id of tenantIds) await withTenant(id, (tx) => tx.tenant.delete({ where: { id } }));
    for (const email of userEmails) await prisma.user.deleteMany({ where: { email } });
  });

  describe("roles and removal", () => {
    it("the owner's membership cannot have its roles changed or be removed", async () => {
      const { ctx } = await makeOwnerContext("Protect Owner Co");
      tenantIds.push(ctx.tenantId);

      const members = await listMembers(ctx);
      const ownerMembership = members.find((m) => m.isOwner)!;

      await expect(updateMemberRoles(ctx, ownerMembership.membershipId, { roleIds: [] })).rejects.toThrow();
      await expect(removeMember(ctx, ownerMembership.membershipId)).rejects.toThrow(/owner cannot be removed/);
    });

    it("a regular member's roles can be changed, and they can be removed by someone else", async () => {
      const { ctx, salesRepRoleId } = await makeOwnerContext("Manage Member Co");
      tenantIds.push(ctx.tenantId);
      const inviteeEmail = `manage-${Date.now()}@example.com`;
      userEmails.push(inviteeEmail);

      const { token } = await inviteMember(ctx, { email: inviteeEmail, roleIds: [salesRepRoleId] });
      await acceptInvitation(token, { name: "Managed", password: "password123" });

      const members = await listMembers(ctx);
      const managed = members.find((m) => m.email === inviteeEmail)!;

      const warehouseRole = await withTenant(ctx.tenantId, (tx) => tx.role.findFirstOrThrow({ where: { tenantId: ctx.tenantId, name: "Warehouse" } }));
      await updateMemberRoles(ctx, managed.membershipId, { roleIds: [warehouseRole.id] });

      const afterUpdate = await listMembers(ctx);
      expect(afterUpdate.find((m) => m.email === inviteeEmail)!.roleNames).toEqual(["Warehouse"]);

      await removeMember(ctx, managed.membershipId);
      const afterRemove = await listMembers(ctx);
      expect(afterRemove.some((m) => m.email === inviteeEmail)).toBe(false);
    });
  });
});
