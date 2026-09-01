import { AlertCircle } from "lucide-react";
import { Card, CardBody } from "@/components/ui/card";
import { auth } from "@/lib/auth/auth";
import { getInvitationPreview } from "@/server/core/invitations";
import { AcceptInvitationForm } from "./accept-form";

export const metadata = { title: "Join organisation" };

export default async function AcceptInvitationPage({ params }: PageProps<"/invite/[token]">) {
  const { token } = await params;
  const [preview, session] = await Promise.all([getInvitationPreview(token), auth()]);

  if ("error" in preview) {
    return (
      <Card>
        <CardBody className="p-6 text-center">
          <AlertCircle className="mx-auto size-8 text-danger" />
          <h1 className="mt-3 font-display text-xl text-ink">Can&apos;t open this invitation</h1>
          <p className="mt-1 text-sm text-ink-muted">{preview.error}</p>
        </CardBody>
      </Card>
    );
  }

  const currentEmail = session?.user?.email ?? null;

  return (
    <Card>
      <CardBody className="p-6">
        <h1 className="font-display text-2xl text-ink">Join {preview.tenantName}</h1>
        <p className="mt-1 text-sm text-ink-muted">
          You&apos;ve been invited as {preview.roleNames.join(", ") || "a member"}.
        </p>

        <AcceptInvitationForm token={token} preview={preview} currentEmail={currentEmail} />
      </CardBody>
    </Card>
  );
}
