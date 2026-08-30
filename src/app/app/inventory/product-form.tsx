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
import type { ProductDTO } from "@/server/catalog/products";
import type { CatalogOptions } from "@/server/catalog/options";
import { createProductAction, updateProductAction, type ActionResult } from "./actions";

export function ProductForm({
  open,
  onOpenChange,
  product,
  options,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Present = editing; absent = creating. */
  product?: ProductDTO | null;
  options: CatalogOptions;
  onSaved: () => void;
}) {
  const isEdit = Boolean(product);
  const action = isEdit
    ? updateProductAction.bind(null, product!.id)
    : createProductAction;

  const [state, formAction, pending] = useActionState<ActionResult, FormData>(action, {
    ok: false,
  });

  // Close and refresh on success. A ref avoids re-running this on every
  // render while still reacting the instant the action settles.
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
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit product" : "New product"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? `Editing ${product!.sku}`
              : "SKU and unit are required; everything else can be filled in later."}
          </DialogDescription>
        </DialogHeader>

        <form action={formAction}>
          <DialogBody className="max-h-[65vh] space-y-4 overflow-y-auto">
            <div className="grid grid-cols-2 gap-3">
              <Field label="SKU" htmlFor="sku" error={err("sku")} required>
                <Input
                  id="sku"
                  name="sku"
                  defaultValue={product?.sku}
                  placeholder="BRG-6204ZZ"
                  className="font-mono"
                  required
                />
              </Field>
              <Field label="Type" htmlFor="type">
                <Select id="type" name="type" defaultValue={product?.type ?? "goods"}>
                  <option value="goods">Goods</option>
                  <option value="service">Service</option>
                </Select>
              </Field>
            </div>

            <Field label="Name" htmlFor="name" error={err("name")} required>
              <Input id="name" name="name" defaultValue={product?.name} placeholder="Industrial Bearing 6204-ZZ" required />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Unit of measure" htmlFor="uomId" error={err("uomId")} required>
                <Select id="uomId" name="uomId" defaultValue={product?.uomCode ? undefined : ""} required>
                  {!product ? <option value="">Select a unit...</option> : null}
                  {options.units.map((u) => (
                    <option key={u.id} value={u.id} selected={u.code === product?.uomCode}>
                      {u.name} ({u.code})
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Category" htmlFor="categoryId">
                <Select id="categoryId" name="categoryId" defaultValue="">
                  <option value="">No category</option>
                  {options.categories.map((c) => (
                    <option key={c.id} value={c.id} selected={c.name === product?.categoryName}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Sales price" htmlFor="salesPrice" error={err("salesPrice")}>
                <Input
                  id="salesPrice"
                  name="salesPrice"
                  type="number"
                  step="0.01"
                  min="0"
                  defaultValue={product?.salesPrice ?? 0}
                  className="tnum"
                />
              </Field>
              <Field label="Cost price" htmlFor="costPrice" error={err("costPrice")}>
                <Input
                  id="costPrice"
                  name="costPrice"
                  type="number"
                  step="0.01"
                  min="0"
                  defaultValue={product?.costPrice ?? 0}
                  className="tnum"
                />
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="HSN / SAC code" htmlFor="hsnCode" error={err("hsnCode")}>
                <Input id="hsnCode" name="hsnCode" defaultValue={product?.hsnCode ?? ""} placeholder="8482" className="font-mono" />
              </Field>
              <Field label="Tax category" htmlFor="taxCategoryId">
                <Select id="taxCategoryId" name="taxCategoryId" defaultValue="">
                  <option value="">Default</option>
                  {options.taxCategories.map((c) => (
                    <option key={c.id} value={c.id} selected={c.key === product?.taxCategoryKey}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>

            <Field label="Stock tracking" htmlFor="tracking">
              <Select id="tracking" name="tracking" defaultValue={product?.tracking ?? "none"}>
                <option value="none">None</option>
                <option value="lot">Lot</option>
                <option value="serial">Serial</option>
              </Select>
            </Field>

            <div className="flex flex-wrap gap-5 pt-1">
              <CheckField name="isSellable" label="Sellable" defaultChecked={product?.isSellable ?? true} />
              <CheckField name="isPurchasable" label="Purchasable" defaultChecked={true} />
              <CheckField name="isActive" label="Active" defaultChecked={product?.isActive ?? true} />
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
              {pending ? "Saving..." : isEdit ? "Save changes" : "Create product"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
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

function CheckField({
  name,
  label,
  defaultChecked,
}: {
  name: string;
  label: string;
  defaultChecked?: boolean;
}) {
  return (
    <label className="flex items-center gap-2 text-sm text-ink">
      <Checkbox name={name} defaultChecked={defaultChecked} />
      {label}
    </label>
  );
}
