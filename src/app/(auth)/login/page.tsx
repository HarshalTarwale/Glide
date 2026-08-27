"use client";

import Link from "next/link";
import { useActionState } from "react";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardBody } from "@/components/ui/card";
import { loginAction, type AuthFormState } from "./actions";

export default function LoginPage() {
  const [state, action, pending] = useActionState<AuthFormState, FormData>(loginAction, {});

  return (
    <Card>
      <CardBody className="p-6">
        <h1 className="font-display text-2xl text-ink">Sign in</h1>
        <p className="mt-1 text-sm text-ink-muted">Welcome back.</p>

        <form action={action} className="mt-6 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="email" required>
              Email
            </Label>
            <Input id="email" name="email" type="email" autoComplete="email" required />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="password" required>
              Password
            </Label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
            />
          </div>

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
            {pending ? "Signing in..." : "Sign in"}
          </Button>
        </form>

        <p className="mt-5 text-center text-xs text-ink-muted">
          No account?{" "}
          <Link href="/signup" className="font-medium text-accent hover:underline">
            Create one
          </Link>
        </p>
      </CardBody>
    </Card>
  );
}
