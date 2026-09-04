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
import { Select } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import type { LedgerAccountDTO } from "@/server/accounting/accounts";
import { createAccountAction, updateAccountAction, type ActionResult } from "../actions";

export function AccountForm({
  open,
  onOpenChange,
  account,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  account: LedgerAccountDTO | null;
  onSaved: () => void;
}) {
  const action = account ? updateAccountAction.bind(null, account.id) : createAccountAction;
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(action, { ok: false });
  const [isActive, setIsActive] = React.useState(account?.isActive ?? true);

  const prevOk = React.useRef(false);
  React.useEffect(() => {
    if (state.ok && !prevOk.current) {
      onOpenChange(false);
      onSaved();
    }
    prevOk.current = state.ok;
  }, [state.ok, onOpenChange, onSaved]);

  // Reset isActive whenever the dialog opens for a (possibly different)
  // account -- adjusted during render, not in an effect, the same pattern
  // stock-move-form.tsx uses for the identical "opening the dialog resets
  // its state" need.
  const [wasOpenFor, setWasOpenFor] = React.useState<string | null>(null);
  const openKey = open ? (account?.id ?? "__new__") : null;
  if (openKey !== wasOpenFor) {
    setWasOpenFor(openKey);
    if (openKey !== null) setIsActive(account?.isActive ?? true);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{account ? "Edit account" : "New account"}</DialogTitle>
          <DialogDescription>
            {account?.systemKey
              ? "This account is posted to automatically by the ledger — its type is locked."
              : "Added to your chart of accounts."}
          </DialogDescription>
        </DialogHeader>

        <form action={formAction}>
          <DialogBody className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="code" required>
                  Code
                </Label>
                <Input id="code" name="code" defaultValue={account?.code} placeholder="1300" className="font-mono" required />
                {state.fieldErrors?.code ? <p className="text-2xs text-danger">{state.fieldErrors.code}</p> : null}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="type" required>
                  Type
                </Label>
                <Select id="type" name="type" defaultValue={account?.type ?? "asset"} disabled={Boolean(account?.systemKey)} required>
                  <option value="asset">Asset</option>
                  <option value="liability">Liability</option>
                  <option value="equity">Equity</option>
                  <option value="revenue">Revenue</option>
                  <option value="expense">Expense</option>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="name" required>
                Name
              </Label>
              <Input id="name" name="name" defaultValue={account?.name} placeholder="Office Supplies Expense" required />
              {state.fieldErrors?.name ? <p className="text-2xs text-danger">{state.fieldErrors.name}</p> : null}
            </div>

            <label className="flex items-center gap-2 text-sm text-ink">
              <Checkbox checked={isActive} onCheckedChange={(checked) => setIsActive(checked === true)} />
              <input type="hidden" name="isActive" value={isActive ? "on" : ""} />
              Active
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
              {pending ? "Saving..." : account ? "Save changes" : "Create account"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
