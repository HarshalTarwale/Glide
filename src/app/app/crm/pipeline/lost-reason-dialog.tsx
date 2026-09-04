"use client";

import * as React from "react";
import { toast } from "sonner";
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
import { Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import type { OpportunityDTO } from "@/server/crm/opportunities";
import { changeStageAction } from "../actions";

/** The one field a closed-lost opportunity must carry -- see crm.prisma's Opportunity.lostReason doc comment. */
export function LostReasonDialog({
  opportunity,
  open,
  onOpenChange,
  onSaved,
}: {
  opportunity: OpportunityDTO | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const [reason, setReason] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Reset the form whenever the dialog transitions to open -- React's
  // documented "adjust state during render" pattern, not an effect (same
  // fix as stock-move-form.tsx's mount reset, for the same reason: this
  // must run before paint, and setState-in-effect trips the React
  // Compiler's cascading-render lint).
  const [wasOpen, setWasOpen] = React.useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setReason("");
      setError(null);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!opportunity) return;
    setPending(true);
    setError(null);
    const result = await changeStageAction(opportunity.id, "lost", reason);
    setPending(false);
    if (result.ok) {
      toast.success("Marked lost");
      onSaved();
    } else {
      setError(result.error ?? "Could not mark this opportunity lost");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Mark lost</DialogTitle>
          <DialogDescription>{opportunity?.name}</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <DialogBody className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="lostReason" required>
                Reason
              </Label>
              <Textarea id="lostReason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why did this deal not close?" required />
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
            <Button type="submit" variant="primary" size="md" disabled={pending || reason.trim().length === 0}>
              {pending ? "Saving..." : "Mark lost"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
