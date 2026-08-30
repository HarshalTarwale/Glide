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
import { Button } from "@/components/ui/button";
import type { StockFormOptions } from "@/server/inventory/stock-options";
import {
  receiveStockAction,
  deliverStockAction,
  transferStockAction,
  adjustStockAction,
  type ActionResult,
} from "./actions";

type MoveKind = "receipt" | "delivery" | "transfer" | "adjustment";

const ACTION_BY_KIND: Record<MoveKind, typeof receiveStockAction> = {
  receipt: receiveStockAction,
  delivery: deliverStockAction,
  transfer: transferStockAction,
  adjustment: adjustStockAction,
};

const TITLE: Record<MoveKind, string> = {
  receipt: "Receive stock",
  delivery: "Deliver stock",
  transfer: "Transfer stock",
  adjustment: "Adjust stock",
};

/**
 * One dialog, one move-type selector, four thin Server Actions underneath --
 * the same "one shared component, not four one-off screens" instinct behind
 * DataTable and LineItemsTable. Which fields show depends only on `kind`.
 */
export function StockMoveForm({
  open,
  onOpenChange,
  options,
  defaultKind = "receipt",
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  options: StockFormOptions;
  defaultKind?: MoveKind;
  onSaved: () => void;
}) {
  const [kind, setKind] = React.useState<MoveKind>(defaultKind);
  // Reset the selected move type to defaultKind each time the dialog
  // transitions from closed to open. Adjusted DURING render (React's
  // documented pattern for "state that should reset when a prop changes"),
  // not in an effect -- an effect here would setState synchronously on
  // mount, forcing an extra render for something render itself can decide.
  const [wasOpen, setWasOpen] = React.useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setKind(defaultKind);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{TITLE[kind]}</DialogTitle>
          <DialogDescription>Every move is recorded in the stock ledger and cannot be edited afterward.</DialogDescription>
        </DialogHeader>

        {/* key={kind} fully remounts this subtree on type change -- not just
            a <form>, but the useActionState call inside MoveFields. That
            resets pending state AND any field errors left from a different
            move type: without it, switching from a rejected "receipt" to
            "delivery" would keep showing the receipt's error message. */}
        <MoveFields
          key={kind}
          kind={kind}
          onKindChange={setKind}
          options={options}
          onOpenChange={onOpenChange}
          onSaved={onSaved}
        />
      </DialogContent>
    </Dialog>
  );
}

function MoveFields({
  kind,
  onKindChange,
  options,
  onOpenChange,
  onSaved,
}: {
  kind: MoveKind;
  onKindChange: (kind: MoveKind) => void;
  options: StockFormOptions;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const [direction, setDirection] = React.useState<"increase" | "decrease">("decrease");
  const [productId, setProductId] = React.useState("");

  const [state, formAction, pending] = useActionState<ActionResult, FormData>(ACTION_BY_KIND[kind], {
    ok: false,
  });

  const prevOk = React.useRef(false);
  React.useEffect(() => {
    if (state.ok && !prevOk.current) {
      onOpenChange(false);
      onSaved();
    }
    prevOk.current = state.ok;
  }, [state.ok, onOpenChange, onSaved]);

  const err = (field: string) => state.fieldErrors?.[field];
  const product = options.products.find((p) => p.id === productId);
  const needsLot = product && product.tracking !== "none";

  return (
    <form action={formAction}>
      <DialogBody className="space-y-4">
        <Field label="Move type" htmlFor="moveKind">
          <Select id="moveKind" value={kind} onChange={(e) => onKindChange(e.target.value as MoveKind)}>
            <option value="receipt">Receipt — from a supplier</option>
            <option value="delivery">Delivery — to a customer</option>
            <option value="transfer">Transfer — between locations</option>
            <option value="adjustment">Adjustment — physical count correction</option>
          </Select>
        </Field>

        <Field label="Product" htmlFor="productId" error={err("productId")} required>
          <Select
            id="productId"
            name="productId"
            required
            value={productId}
            onChange={(e) => setProductId(e.target.value)}
          >
            <option value="">Select a product...</option>
            {options.products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.sku})
              </option>
            ))}
          </Select>
        </Field>

        {kind === "receipt" ? (
          <Field label="Into location" htmlFor="toLocationId" error={err("toLocationId")} required>
            <LocationSelect id="toLocationId" name="toLocationId" options={options} />
          </Field>
        ) : null}

        {kind === "delivery" ? (
          <Field label="From location" htmlFor="fromLocationId" error={err("fromLocationId")} required>
            <LocationSelect id="fromLocationId" name="fromLocationId" options={options} />
          </Field>
        ) : null}

        {kind === "transfer" ? (
          <div className="grid grid-cols-2 gap-3">
            <Field label="From location" htmlFor="fromLocationId" error={err("fromLocationId")} required>
              <LocationSelect id="fromLocationId" name="fromLocationId" options={options} />
            </Field>
            <Field label="To location" htmlFor="toLocationId" error={err("toLocationId")} required>
              <LocationSelect id="toLocationId" name="toLocationId" options={options} />
            </Field>
          </div>
        ) : null}

        {kind === "adjustment" ? (
          <>
            <Field label="Location" htmlFor="locationId" error={err("locationId")} required>
              <LocationSelect id="locationId" name="locationId" options={options} />
            </Field>
            <Field label="Direction" htmlFor="direction">
              <Select
                id="direction"
                name="direction"
                value={direction}
                onChange={(e) => setDirection(e.target.value as "increase" | "decrease")}
              >
                <option value="decrease">Decrease — found less than expected</option>
                <option value="increase">Increase — found more than expected</option>
              </Select>
            </Field>
          </>
        ) : null}

        <div className="grid grid-cols-2 gap-3">
          <Field
            label={`Quantity (${product?.uomCode ?? "units"})`}
            htmlFor="quantity"
            error={err("quantity")}
            required
          >
            <Input id="quantity" name="quantity" type="number" step="0.000001" min="0.000001" required className="tnum" />
          </Field>
          {kind === "receipt" || (kind === "adjustment" && direction === "increase") ? (
            <Field label="Unit cost" htmlFor="unitCost" error={err("unitCost")} required>
              <Input id="unitCost" name="unitCost" type="number" step="0.01" min="0" required className="tnum" />
            </Field>
          ) : null}
        </div>

        {needsLot ? (
          <Field
            label={product!.tracking === "serial" ? "Serial number" : "Lot number"}
            htmlFor="lotCode"
            error={err("lotCode")}
            required
          >
            <Input id="lotCode" name="lotCode" required placeholder="e.g. L2026-014" className="font-mono" />
          </Field>
        ) : null}

        <Field label="Reference" htmlFor="reference">
          <Input id="reference" name="reference" placeholder="PO-1042, cycle count, etc." />
        </Field>

        {state.error ? (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-md border border-danger/20 bg-danger-soft px-3 py-2 text-xs text-danger"
          >
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
          {pending ? "Recording..." : TITLE[kind]}
        </Button>
      </DialogFooter>
    </form>
  );
}

function LocationSelect({
  id,
  name,
  options,
}: {
  id: string;
  name: string;
  options: StockFormOptions;
}) {
  return (
    <Select id={id} name={name} required>
      <option value="">Select a location...</option>
      {options.locations.map((l) => (
        <option key={l.id} value={l.id}>
          {l.warehouseName ? `${l.warehouseName} — ` : ""}
          {l.name} ({l.code})
        </option>
      ))}
    </Select>
  );
}

function Field({
  label,
  htmlFor,
  error,
  required,
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor} required={required}>
        {label}
      </Label>
      {children}
      {error ? <p className="text-2xs text-danger">{error}</p> : null}
    </div>
  );
}
