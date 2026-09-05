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
import { Button } from "@/components/ui/button";
import type { DepartmentDTO } from "@/server/hr/departments";
import { createDepartmentAction, renameDepartmentAction, type ActionResult } from "../actions";

export function DepartmentForm({
  open,
  onOpenChange,
  department,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  department: DepartmentDTO | null;
  onSaved: () => void;
}) {
  const action = department ? renameDepartmentAction.bind(null, department.id) : createDepartmentAction;
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(action, { ok: false });

  const prevOk = React.useRef(false);
  React.useEffect(() => {
    if (state.ok && !prevOk.current) {
      onOpenChange(false);
      onSaved();
    }
    prevOk.current = state.ok;
  }, [state.ok, onOpenChange, onSaved]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{department ? "Rename department" : "New department"}</DialogTitle>
          <DialogDescription>Departments group employees for reporting -- they don&apos;t affect permissions.</DialogDescription>
        </DialogHeader>

        <form action={formAction}>
          <DialogBody className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="name" required>
                Name
              </Label>
              <Input id="name" name="name" defaultValue={department?.name} placeholder="Engineering" required />
              {state.fieldErrors?.name ? <p className="text-2xs text-danger">{state.fieldErrors.name}</p> : null}
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
              {pending ? "Saving..." : department ? "Save changes" : "Create department"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
