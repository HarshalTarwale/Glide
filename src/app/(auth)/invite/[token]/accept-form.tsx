"use client";

import * as React from "react";
import { useActionState } from "react";
import Link from "next/link";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { InvitationPreviewDTO } from "@/server/core/invitations";
import { acceptNewAccountAction, acceptExistingAccountAction, type AcceptFormState } from "./actions";

export function AcceptInvitationForm({
  token,
  preview,
  currentEmail,
}: {
  token: string;
  preview: InvitationPreviewDTO;
  currentEmail: string | null;
}) {
  const signedInAsInvitee = currentEmail?.toLowerCase() === preview.email.toLowerCase();
  const signedInAsSomeoneElse = currentEmail !== null && !signedInAsInvitee;

  if (preview.hasExistingAccount) {
    return (
      <ExistingAccountPanel
        token={token}
        email={preview.email}
        signedInAsInvitee={signedInAsInvitee}
        signedInAsSomeoneElse={signedInAsSomeoneElse}
      />
    );
  }

  if (signedInAsSomeoneElse) {
    return (
      <div className="mt-6 rounded-md border border-warning/20 bg-warning-soft px-3 py-2.5 text-xs text-warning">
        You&apos;re signed in as {currentEmail}, but this invitation is for {preview.email}. Sign out first to
        create an account for {preview.email}.
      </div>
    );
  }

  return <NewAccountForm token={token} email={preview.email} />;
}

function ExistingAccountPanel({
  token,
  email,
  signedInAsInvitee,
  signedInAsSomeoneElse,
}: {
  token: string;
  email: string;
  signedInAsInvitee: boolean;
  signedInAsSomeoneElse: boolean;
}) {
  const [state, formAction, pending] = useActionState<AcceptFormState, FormData>(
    async () => acceptExistingAccountAction(token, email),
    {}
  );

  if (signedInAsInvitee) {
    return (
      <form action={formAction} className="mt-6">
        <Button type="submit" variant="primary" size="lg" className="w-full" disabled={pending}>
          {pending ? "Joining..." : "Accept and join"}
        </Button>
        {state.error ? <ErrorBanner message={state.error} /> : null}
      </form>
    );
  }

  return (
    <div className="mt-6 space-y-3">
      <p className="text-sm text-ink-muted">
        There&apos;s already a Glide account for <span className="font-medium text-ink">{email}</span>.
        {signedInAsSomeoneElse ? " Sign out, then sign in as that account to accept." : " Sign in to accept."}
      </p>
      <Button asChild variant="primary" size="lg" className="w-full">
        <Link href={`/login?next=/invite/${token}`}>Sign in</Link>
      </Button>
    </div>
  );
}

function NewAccountForm({ token, email }: { token: string; email: string }) {
  const action = acceptNewAccountAction.bind(null, token);
  const [state, formAction, pending] = useActionState<AcceptFormState, FormData>(action, {});

  return (
    <form action={formAction} className="mt-6 space-y-4">
      <input type="hidden" name="email" value={email} />
      <div className="space-y-1.5">
        <Label>Email</Label>
        <Input value={email} disabled />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="name" required>
          Your name
        </Label>
        <Input id="name" name="name" placeholder="Aditya Hazari" required />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="password" required>
          Choose a password
        </Label>
        <Input id="password" name="password" type="password" autoComplete="new-password" required />
        <p className="text-2xs text-ink-subtle">At least 8 characters.</p>
      </div>

      {state.error ? <ErrorBanner message={state.error} /> : null}

      <Button type="submit" variant="primary" size="lg" className="w-full" disabled={pending}>
        {pending ? "Joining..." : "Join organisation"}
      </Button>
    </form>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div role="alert" className="mt-3 flex items-start gap-2 rounded-md border border-danger/20 bg-danger-soft px-3 py-2 text-xs text-danger">
      <AlertCircle className="mt-px size-3.5 shrink-0" />
      <span>{message}</span>
    </div>
  );
}
