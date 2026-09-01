-- ============================================================
-- Invitation bootstrap: the same "identity before tenant context" problem
-- app_current_user() solves for Membership (migration 00000000000001_rls),
-- applied to an invitation link. Whoever holds the token in the URL IS the
-- authorization -- it's a unique, unguessable value generated server-side
-- and known only to the invitee -- so a session-scoped setting naming that
-- one token is exactly as safe as the existing app_current_user() escape
-- hatch, and no less scoped: it admits exactly one row.
--
-- WITH CHECK deliberately stays tenant-only. The token path can never be
-- used to WRITE (accept an invitation updates it via a normal withTenant()
-- call, once the read above has revealed which tenant it belongs to) --
-- only to read the one row needed to show "you've been invited to X".
-- ============================================================

CREATE OR REPLACE FUNCTION app_current_invite_token() RETURNS text
  LANGUAGE sql STABLE AS $$
    SELECT NULLIF(current_setting('app.current_invite_token', true), '')
  $$;

DROP POLICY tenant_isolation ON "invitation";
CREATE POLICY tenant_isolation ON "invitation"
  USING ("tenantId" = app_current_tenant() OR "token" = app_current_invite_token())
  WITH CHECK ("tenantId" = app_current_tenant());
