"use client";

import * as React from "react";
import { useActionState } from "react";
import { AlertCircle } from "lucide-react";
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
import type { LeaveTypeDTO } from "@/server/hr/leave-types";
import { createLeaveTypeAction, updateLeaveTypeAction, type ActionResult } from "../actions";

export function LeaveTypeForm({
  open,
  onOpenChange,
  leaveType,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  leaveType: LeaveTypeDTO | null;
  onSaved: () => void;
}) {
  const action = leaveType ? updateLeaveTypeAction.bind(null, leaveType.id) : createLeaveTypeAction;
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(action, { ok: false });
  const [isPaid, setIsPaid] = React.useState(leaveType?.isPaid ?? true);

  const prevOk = React.useRef(false);
  React.useEffect(() => {
    if (state.ok && !prevOk.current) {
      onOpenChange(false);
      onSaved();
    }
    prevOk.current = state.ok;
  }, [state.ok, onOpenChange, onSaved]);

  // Same render-time reset pattern as account-form.tsx: adjust local state
  // when the dialog opens for a (possibly different) leave type, not in an
  // effect.
  const [wasOpenFor, setWasOpenFor] = React.useState<string | null>(null);
  const openKey = open ? (leaveType?.id ?? "__new__") : null;
  if (openKey !== wasOpenFor) {
    setWasOpenFor(openKey);
    if (openKey !== null) setIsPaid(leaveType?.isPaid ?? true);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{leaveType ? "Edit leave type" : "New leave type"}</DialogTitle>
          <DialogDescription>The annual allocation drives every employee&apos;s derived leave balance for this type.</DialogDescription>
        </DialogHeader>

        <form action={formAction}>
          <DialogBody className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="name" required>
                  Name
                </Label>
                <Input id="name" name="name" defaultValue={leaveType?.name} placeholder="Annual Leave" required />
                {state.fieldErrors?.name ? <p className="text-2xs text-danger">{state.fieldErrors.name}</p> : null}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="code" required>
                  Code
                </Label>
                <Input id="code" name="code" defaultValue={leaveType?.code} placeholder="ANNUAL" className="font-mono" required />
                {state.fieldErrors?.code ? <p className="text-2xs text-danger">{state.fieldErrors.code}</p> : null}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="defaultAnnualDays" required>
                Annual allocation (days)
              </Label>
              <Input id="defaultAnnualDays" name="defaultAnnualDays" type="number" min="0" step="0.5" defaultValue={leaveType?.defaultAnnualDays ?? 0} className="tnum" required />
            </div>

            <label className="flex items-center gap-2 text-sm text-ink">
              <Checkbox checked={isPaid} onCheckedChange={(checked) => setIsPaid(checked === true)} />
              <input type="hidden" name="isPaid" value={isPaid ? "on" : ""} />
              Paid leave
            </label>

            {state.error ? (
              <div role="alert" className="flex items-start gap-2 rounded-md border border-danger/20 bg-danger-soft px-3 py-2 text-xs text-danger">
                <AlertCircle className="mt-px size-3.5 shrink-0" />
                <span>{state.error}</span>
              </div>
            ) : null}
          </DialogBody>

          <DialogFooter>
            <Button type="button" variant="ghost" size="md" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" size="md" disabled={pending}>
              {pending ? "Saving..." : leaveType ? "Save changes" : "Create leave type"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
