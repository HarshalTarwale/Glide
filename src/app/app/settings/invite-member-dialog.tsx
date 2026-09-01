"use client";

import * as React from "react";
import { useActionState } from "react";
import { toast } from "sonner";
import { AlertCircle, Check, Copy } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogBody,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import type { ActionResult } from "./actions";
import { inviteMemberAction } from "./actions";
import type { RoleOption } from "./members-section";

/**
 * No email delivery yet (docs/roadmap.md's P5 section) -- a successful
 * invite shows the link here for the inviter to copy and send however
 * they currently reach that person, instead of closing the dialog the way
 * every other create-dialog in the app does.
 */
export function InviteMemberDialog({
  open,
  onOpenChange,
  roles,
  onInvited,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  roles: RoleOption[];
  onInvited: () => void;
}) {
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(inviteMemberAction, { ok: false });
  const [roleIds, setRoleIds] = React.useState<string[]>([]);
  const [copied, setCopied] = React.useState(false);

  const prevToken = React.useRef<string | undefined>(undefined);
  React.useEffect(() => {
    if (state.ok && state.token && state.token !== prevToken.current) {
      onInvited();
    }
    prevToken.current = state.token;
  }, [state.ok, state.token, onInvited]);

  function handleClose(next: boolean) {
    if (!next) {
      setRoleIds([]);
      setCopied(false);
    }
    onOpenChange(next);
  }

  const inviteLink = state.token && typeof window !== "undefined" ? `${window.location.origin}/invite/${state.token}` : null;

  async function copyLink() {
    if (!inviteLink) return;
    try {
      await navigator.clipboard.writeText(inviteLink);
      setCopied(true);
      toast.success("Link copied");
    } catch {
      toast.error("Could not copy -- select and copy the link manually");
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Invite a member</DialogTitle>
          <DialogDescription>
            {inviteLink
              ? "Share this link with them -- it's valid for 7 days."
              : "They'll be added once they open the link and set a password."}
          </DialogDescription>
        </DialogHeader>

        {inviteLink ? (
          <DialogBody className="space-y-3">
            <div className="flex items-center gap-2 rounded-md border border-hairline bg-surface-sunken px-3 py-2.5">
              <code className="min-w-0 flex-1 truncate text-xs text-ink">{inviteLink}</code>
              <Button type="button" variant="ghost" size="iconSm" onClick={() => void copyLink()} aria-label="Copy invite link">
                {copied ? <Check className="text-success" /> : <Copy />}
              </Button>
            </div>
          </DialogBody>
        ) : (
          <form action={formAction}>
            <DialogBody className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="inviteEmail" required>
                  Email
                </Label>
                <Input id="inviteEmail" name="email" type="email" placeholder="teammate@company.com" required />
                {state.fieldErrors?.email ? <p className="text-2xs text-danger">{state.fieldErrors.email}</p> : null}
              </div>

              <div className="space-y-1.5">
                <Label required>Roles</Label>
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
                {roleIds.map((id) => (
                  <input key={id} type="hidden" name="roleIds" value={id} />
                ))}
                {state.fieldErrors?.roleIds ? <p className="text-2xs text-danger">{state.fieldErrors.roleIds}</p> : null}
              </div>

              {state.error ? (
                <div role="alert" className="flex items-start gap-2 rounded-md border border-danger/20 bg-danger-soft px-3 py-2 text-xs text-danger">
                  <AlertCircle className="mt-px size-3.5 shrink-0" />
                  <span>{state.error}</span>
                </div>
              ) : null}
            </DialogBody>

            <DialogFooter>
              <Button type="button" variant="ghost" size="md" onClick={() => handleClose(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" size="md" disabled={pending || roleIds.length === 0}>
                {pending ? "Inviting..." : "Create invitation"}
              </Button>
            </DialogFooter>
          </form>
        )}

        {inviteLink ? (
          <DialogFooter>
            <Button type="button" variant="primary" size="md" onClick={() => handleClose(false)}>
              Done
            </Button>
          </DialogFooter>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
