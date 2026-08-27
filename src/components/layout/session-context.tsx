"use client";

import * as React from "react";

export interface SessionInfo {
  userName: string;
  userEmail: string;
  tenantName: string;
  country: string;
  currency: string;
  /** null in preview mode; otherwise the union of the user's role grants. */
  permissions: string[] | null;
  isPreview: boolean;
  dbReady: boolean;
}

const Ctx = React.createContext<SessionInfo | null>(null);

export function SessionProvider({
  value,
  children,
}: {
  value: SessionInfo;
  children: React.ReactNode;
}) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession(): SessionInfo {
  const ctx = React.useContext(Ctx);
  if (!ctx) throw new Error("useSession must be used inside <AppShell>");
  return ctx;
}

/**
 * Client-side permission gate. This is UX, not security — it hides controls
 * a user cannot use. The real check is assertPermission() in the service
 * layer, which runs on every request regardless of what the UI rendered.
 *
 * In preview mode (no session) everything is visible so the design system
 * stays inspectable.
 */
export function useHasPermission(permission: string): boolean {
  const { permissions } = useSession();
  if (permissions === null) return true;
  return permissions.includes(permission);
}

export function PermissionGate({
  permission,
  children,
  fallback = null,
}: {
  permission: string;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}) {
  return useHasPermission(permission) ? <>{children}</> : <>{fallback}</>;
}
