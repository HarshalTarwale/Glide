-- ============================================================
-- Extends "tenant"'s RLS policy with the same invite-token bootstrap
-- clause migration 00000000000011 gave "invitation" -- getInvitationPreview
-- includes the tenant relation (to show "you've been invited to X") while
-- only app.current_invite_token is set, no app.current_tenant_id or
-- app.current_user_id yet. Without this, the include silently comes back
-- null: the tenant row exists and the invitation row referencing it is
-- visible, but the tenant table's OWN policy has no clause admitting it
-- under this bootstrap context -- caught by tests/invitations.test.ts.
--
-- Same shape as the existing membership-based clause: a legitimate
-- bootstrap credential (an unguessable, single-use invitation token,
-- exactly as authorizing as being a member) makes exactly the one tenant
-- it points at visible, nothing else.
-- ============================================================

DROP POLICY tenant_isolation ON "tenant";
CREATE POLICY tenant_isolation ON "tenant"
  USING (
    "id" = app_current_tenant()
    OR EXISTS (SELECT 1 FROM "membership" m
               WHERE m."tenantId" = "tenant"."id"
                 AND m."userId" = app_current_user())
    OR EXISTS (SELECT 1 FROM "invitation" i
               WHERE i."tenantId" = "tenant"."id"
                 AND i."token" = app_current_invite_token())
  )
  WITH CHECK ("id" = app_current_tenant());
