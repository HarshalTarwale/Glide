"use client";

import * as React from "react";
import { AlertCircle } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogBody,
  DialogFooter,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import type { MemberDTO } from "@/server/core/members";
import { updateMemberRolesAction } from "./actions";
import type { RoleOption } from "./members-section";

export function EditMemberRolesDialog({
  member,
  roles,
  open,
  onOpenChange,
  onSaved,
}: {
  member: MemberDTO | null;
  roles: RoleOption[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const [roleIds, setRoleIds] = React.useState<string[]>([]);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Reset the checked set whenever a different member's dialog opens --
  // React's "adjust state during render" pattern (not an effect) for the
  // same reason stock-move-form.tsx uses it.
  const [lastMemberId, setLastMemberId] = React.useState<string | null>(null);
  if (member && member.membershipId !== lastMemberId) {
    setLastMemberId(member.membershipId);
    setRoleIds(member.roleIds);
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!member) return;
    setPending(true);
    setError(null);
    const result = await updateMemberRolesAction(member.membershipId, roleIds);
    setPending(false);
    if (result.ok) {
      toast.success(`${member.name}'s roles updated`);
      onOpenChange(false);
      onSaved();
    } else {
      setError(result.error ?? "Could not update their roles");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Edit roles</DialogTitle>
          <DialogDescription>{member?.name}</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <DialogBody className="space-y-3">
            <div className="space-y-1.5 rounded-md border border-hairline p-2.5">
              {roles.map((role) => (
                <label key={role.id} className="flex items-center gap-2 text-sm text-ink">
                  <Checkbox
                    checked={roleIds.includes(role.id)}
                    onCheckedChange={(checked) =>
                      setRoleIds((ids) => (checked ? [...ids, role.id] : ids.filter((id) => id !== role.id)))
                    }
                  />
                  {role.name}
                </label>
              ))}
            </div>

            {error ? (
              <div role="alert" className="flex items-start gap-2 rounded-md border border-danger/20 bg-danger-soft px-3 py-2 text-xs text-danger">
                <AlertCircle className="mt-px size-3.5 shrink-0" />
                <span>{error}</span>
              </div>
            ) : null}
          </DialogBody>

          <DialogFooter>
            <Button type="button" variant="ghost" size="md" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" size="md" disabled={pending || roleIds.length === 0}>
              {pending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
