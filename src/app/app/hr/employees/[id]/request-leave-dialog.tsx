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
import { Input, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { createLeaveRequestAction, type ActionResult } from "../../actions";

export function RequestLeaveDialog({
  open,
  onOpenChange,
  employeeId,
  leaveTypes,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employeeId: string;
  leaveTypes: { id: string; name: string }[];
  onSaved: () => void;
}) {
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(createLeaveRequestAction, { ok: false });

  const prevOk = React.useRef(false);
  React.useEffect(() => {
    if (state.ok && !prevOk.current) {
      onOpenChange(false);
      onSaved();
    }
    prevOk.current = state.ok;
  }, [state.ok, onOpenChange, onSaved]);

  const err = (field: string) => state.fieldErrors?.[field];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Request leave</DialogTitle>
          <DialogDescription>Days are counted as business days (weekends excluded) between the two dates.</DialogDescription>
        </DialogHeader>

        <form action={formAction}>
          <DialogBody className="space-y-3">
            <input type="hidden" name="employeeId" value={employeeId} />

            <div className="space-y-1.5">
              <Label htmlFor="leaveTypeId" required>
                Leave type
              </Label>
              <Select id="leaveTypeId" name="leaveTypeId" required defaultValue="">
                <option value="" disabled>
                  Select a leave type...
                </option>
                {leaveTypes.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </Select>
              {err("leaveTypeId") ? <p className="text-2xs text-danger">{err("leaveTypeId")}</p> : null}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="startDate" required>
                  Start date
                </Label>
                <Input id="startDate" name="startDate" type="date" required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="endDate" required>
                  End date
                </Label>
                <Input id="endDate" name="endDate" type="date" required />
                {err("endDate") ? <p className="text-2xs text-danger">{err("endDate")}</p> : null}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="reason">Reason</Label>
              <Textarea id="reason" name="reason" placeholder="Optional" />
            </div>

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
              {pending ? "Submitting..." : "Submit request"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
