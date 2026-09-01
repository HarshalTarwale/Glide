"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Trash2, UserCog, X } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/erp/empty-state";
import { DateText, Code } from "@/components/erp/money";
import { PermissionGate, useHasPermission } from "@/components/layout/session-context";
import type { MemberDTO } from "@/server/core/members";
import type { InvitationDTO } from "@/server/core/invitations";
import { InviteMemberDialog } from "./invite-member-dialog";
import { EditMemberRolesDialog } from "./edit-member-roles-dialog";
import { revokeInvitationAction, removeMemberAction } from "./actions";

export interface RoleOption {
  id: string;
  name: string;
}

export function MembersSection({
  members,
  pendingInvitations,
  roles,
  currentUserId,
  live,
}: {
  members: MemberDTO[];
  pendingInvitations: InvitationDTO[];
  roles: RoleOption[];
  currentUserId: string;
  live: boolean;
}) {
  const router = useRouter();
  const canInvite = useHasPermission("core:member:invite");
  const canRemove = useHasPermission("core:member:remove");
  const [inviteOpen, setInviteOpen] = React.useState(false);
  const [editingMember, setEditingMember] = React.useState<MemberDTO | null>(null);

  function refresh() {
    router.refresh();
  }

  async function handleRevoke(id: string, email: string) {
    const result = await revokeInvitationAction(id);
    if (result.ok) {
      toast.success(`Invitation to ${email} revoked`);
      router.refresh();
    } else {
      toast.error(result.error ?? "Could not revoke the invitation");
    }
  }

  async function handleRemove(membershipId: string, name: string) {
    const result = await removeMemberAction(membershipId);
    if (result.ok) {
      toast.success(`${name} removed`);
      router.refresh();
    } else {
      toast.error(result.error ?? "Could not remove that member");
    }
  }

  return (
    <Card className="lg:col-span-2">
      <CardHeader>
        <div>
          <CardTitle>Members</CardTitle>
          <span className="text-2xs text-ink-subtle">
            Who&apos;s in this organisation, and what they can do.
          </span>
        </div>
        <PermissionGate permission="core:member:invite">
          <Button variant="secondary" size="sm" onClick={() => setInviteOpen(true)} disabled={!live || !canInvite}>
            <Plus />
            Invite member
          </Button>
        </PermissionGate>
      </CardHeader>

      {members.length === 0 ? (
        <EmptyState title="No members yet" description={live ? "Invite someone to get started." : "Connect a database to manage real members."} />
      ) : (
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-hairline bg-surface-sunken text-2xs uppercase tracking-wide text-ink-subtle">
              <th className="px-4 py-2 text-left font-semibold">Name</th>
              <th className="px-4 py-2 text-left font-semibold">Email</th>
              <th className="px-4 py-2 text-left font-semibold">Roles</th>
              <th className="px-4 py-2 text-left font-semibold">Joined</th>
              <th className="w-20" />
            </tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.membershipId} className="h-row border-b border-hairline last:border-0">
                <td className="px-4 font-medium text-ink">
                  {m.name}
                  {m.userId === currentUserId ? <span className="ml-1.5 text-2xs text-ink-subtle">(you)</span> : null}
                </td>
                <td className="px-4 text-ink-muted">{m.email}</td>
                <td className="px-4">
                  {m.isOwner ? (
                    <Badge tone="accent">Owner</Badge>
                  ) : (
                    <div className="flex flex-wrap gap-1">
                      {m.roleNames.map((name) => (
                        <Badge key={name} tone="neutral">
                          {name}
                        </Badge>
                      ))}
                    </div>
                  )}
                </td>
                <td className="px-4 text-ink-muted">
                  <DateText value={m.joinedAt} />
                </td>
                <td className="px-2">
                  {!m.isOwner ? (
                    <div className="flex items-center justify-end gap-1">
                      <PermissionGate permission="core:member:invite">
                        <Button variant="ghost" size="iconSm" aria-label={`Edit ${m.name}'s roles`} onClick={() => setEditingMember(m)}>
                          <UserCog className="text-ink-subtle" />
                        </Button>
                      </PermissionGate>
                      <PermissionGate permission="core:member:remove">
                        <Button
                          variant="ghost"
                          size="iconSm"
                          aria-label={`Remove ${m.name}`}
                          onClick={() => void handleRemove(m.membershipId, m.name)}
                          disabled={!canRemove || m.userId === currentUserId}
                        >
                          <Trash2 className="text-ink-subtle" />
                        </Button>
                      </PermissionGate>
                    </div>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {pendingInvitations.length > 0 ? (
        <div className="border-t border-hairline">
          <div className="px-4 pt-3 text-2xs font-semibold uppercase tracking-wide text-ink-subtle">
            Pending invitations
          </div>
          <table className="w-full border-collapse text-sm">
            <tbody>
              {pendingInvitations.map((inv) => (
                <tr key={inv.id} className="h-row border-b border-hairline last:border-0">
                  <td className="px-4 text-ink">{inv.email}</td>
                  <td className="px-4">
                    <div className="flex flex-wrap gap-1">
                      {inv.roleNames.map((name) => (
                        <Badge key={name} tone="neutral">
                          {name}
                        </Badge>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 text-2xs text-ink-subtle">
                    Expires <DateText value={inv.expiresAt} />
                  </td>
                  <td className="px-4">
                    <Code className="text-2xs text-ink-subtle">.../invite/{inv.token.slice(0, 10)}…</Code>
                  </td>
                  <td className="px-2">
                    <PermissionGate permission="core:member:invite">
                      <Button variant="ghost" size="iconSm" aria-label={`Revoke invitation to ${inv.email}`} onClick={() => void handleRevoke(inv.id, inv.email)}>
                        <X className="text-ink-subtle" />
                      </Button>
                    </PermissionGate>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {live ? (
        <>
          <InviteMemberDialog open={inviteOpen} onOpenChange={setInviteOpen} roles={roles} onInvited={refresh} />
          <EditMemberRolesDialog
            member={editingMember}
            roles={roles}
            open={editingMember !== null}
            onOpenChange={(open) => !open && setEditingMember(null)}
            onSaved={refresh}
          />
        </>
      ) : null}
    </Card>
  );
}
