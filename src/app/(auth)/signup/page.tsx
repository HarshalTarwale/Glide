"use client";

import Link from "next/link";
import { useActionState } from "react";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardBody } from "@/components/ui/card";
import { COUNTRY_LIST, DEFAULT_COUNTRY } from "@/lib/i18n/countries";
import { signupAction, type SignupFormState } from "./actions";

export default function SignupPage() {
  const [state, action, pending] = useActionState<SignupFormState, FormData>(signupAction, {});

  return (
    <Card>
      <CardBody className="p-6">
        <h1 className="font-display text-2xl text-ink">Create your organisation</h1>
        <p className="mt-1 text-sm text-ink-muted">Up and running in under a minute.</p>

        <form action={action} className="mt-6 space-y-4">
          <Field
            id="organisation"
            label="Organisation"
            placeholder="Northwind Traders"
            error={state.fieldErrors?.organisation}
            required
          />

          <div className="space-y-1.5">
            <Label htmlFor="country" required>
              Country
            </Label>
            <select
              id="country"
              name="country"
              defaultValue={DEFAULT_COUNTRY}
              className="h-control w-full rounded-md border border-hairline-strong bg-surface px-2.5 text-sm text-ink transition-colors hover:border-ink-subtle focus:border-accent focus-visible:outline-none"
            >
              {COUNTRY_LIST.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.name} — {c.currency} · {c.taxLabel}
                </option>
              ))}
            </select>
            <p className="text-2xs text-ink-subtle">
              Sets your currency, number format and tax rules. Changeable later.
            </p>
          </div>

          <Field
            id="name"
            label="Your name"
            placeholder="Aditya Hazari"
            error={state.fieldErrors?.name}
            required
          />
          <Field
            id="email"
            label="Work email"
            type="email"
            autoComplete="email"
            error={state.fieldErrors?.email}
            required
          />
          <Field
            id="password"
            label="Password"
            type="password"
            autoComplete="new-password"
            hint="At least 8 characters."
            error={state.fieldErrors?.password}
            required
          />

          {state.error ? (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-md border border-danger/20 bg-danger-soft px-3 py-2 text-xs text-danger"
            >
              <AlertCircle className="mt-px size-3.5 shrink-0" />
              <span>{state.error}</span>
            </div>
          ) : null}

          <Button type="submit" variant="primary" size="lg" className="w-full" disabled={pending}>
            {pending ? "Creating..." : "Create organisation"}
          </Button>
        </form>

        <p className="mt-5 text-center text-xs text-ink-muted">
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-accent hover:underline">
            Sign in
          </Link>
        </p>
      </CardBody>
    </Card>
  );
}

function Field({
  id,
  label,
  error,
  hint,
  required,
  ...props
}: React.ComponentProps<"input"> & {
  id: string;
  label: string;
  error?: string;
  hint?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} required={required}>
        {label}
      </Label>
      <Input id={id} name={id} required={required} {...props} />
      {error ? (
        <p className="text-2xs text-danger">{error}</p>
      ) : hint ? (
        <p className="text-2xs text-ink-subtle">{hint}</p>
      ) : null}
    </div>
  );
}
