"use client";

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
import { convertLeadAction, type ActionResult } from "../../actions";

export function ConvertLeadDialog({
  open,
  onOpenChange,
  leadId,
  leadName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  leadId: string;
  leadName: string;
}) {
  const action = convertLeadAction.bind(null, leadId);
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(action, { ok: false });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Convert {leadName}</DialogTitle>
          <DialogDescription>Creates a real customer contact, and optionally an opportunity to track the deal.</DialogDescription>
        </DialogHeader>

        <form action={formAction}>
          <DialogBody className="space-y-3">
            <label className="flex items-center gap-2 text-sm text-ink">
              <Checkbox name="createOpportunity" defaultChecked />
              Also create an opportunity
            </label>

            <div className="space-y-1.5">
              <Label htmlFor="opportunityName">Opportunity name</Label>
              <Input id="opportunityName" name="opportunityName" placeholder={`${leadName} — new business`} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="expectedValue">Expected value</Label>
                <Input id="expectedValue" name="expectedValue" type="number" min="0" step="0.01" defaultValue="0" className="tnum" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="expectedCloseDate">Expected close</Label>
                <Input id="expectedCloseDate" name="expectedCloseDate" type="date" />
              </div>
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
              {pending ? "Converting..." : "Convert"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
