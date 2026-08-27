import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/auth";
import { isDatabaseConfigured } from "@/lib/db/client";
import { withTenant, withUser } from "@/lib/db/tenant-client";
import {
  unionPermissions,
  type Permission,
  type RecordScopeId,
} from "@/lib/auth/permissions";

/**
 * The Data Access Layer entry point.
 *
 * Next's own data-security guide recommends exactly this shape for new
 * projects: a server-only layer that resolves identity, performs
 * authorization, and hands back minimal DTOs — rather than scattering auth
 * checks through components. See docs/architecture.md §2.2.
 *
 * cache() dedupes within a single request, so twenty components can ask
 * "who am I" without twenty round trips.
 */

export interface TenantSummary {
  id: string;
  name: string;
}

export interface RequestContext {
  userId: string;
  userName: string;
  userEmail: string;
  tenantId: string;
  tenantName: string;
  /** ISO country code — drives currency, number format and tax regime. */
  country: string;
  currency: string;
  isOwner: boolean;
  permissions: Set<Permission>;
  recordScopes: RecordScopeId[];
  /** Every tenant this user belongs to, for the switcher. */
  availableTenants: TenantSummary[];
}

export const getContext = cache(async (): Promise<RequestContext | null> => {
  if (!isDatabaseConfigured()) return null;

  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return null;

  // --- Step 1: bootstrap. Which tenants is this user in? -------------------
  // Runs under app.current_user_id, which the membership policy admits for a
  // user's OWN rows only. This is the only query that runs without a tenant.
  const memberships = await withUser(userId, (tx) =>
    tx.membership.findMany({
      where: { userId },
      select: {
        tenantId: true,
        isOwner: true,
        tenant: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "asc" },
    })
  );

  if (memberships.length === 0) return null;

  const selectedTenantId =
    (session as { tenantId?: string }).tenantId ??
    memberships[0].tenantId;

  const active =
    memberships.find((m) => m.tenantId === selectedTenantId) ?? memberships[0];

  // --- Step 2: everything else runs fully tenant-scoped --------------------
  const detail = await withTenant(active.tenantId, async (tx) => {
    const [tenant, membership] = await Promise.all([
      tx.tenant.findUniqueOrThrow({
        where: { id: active.tenantId },
        select: { id: true, name: true, country: true, currency: true },
      }),
      tx.membership.findFirstOrThrow({
        where: { tenantId: active.tenantId, userId },
        select: {
          isOwner: true,
          user: { select: { name: true, email: true } },
          roles: {
            select: { role: { select: { permissions: true, recordScope: true } } },
          },
        },
      }),
    ]);
    return { tenant, membership };
  });

  const roles = detail.membership.roles.map((r) => r.role);

  return {
    userId,
    userName: detail.membership.user.name ?? detail.membership.user.email,
    userEmail: detail.membership.user.email,
    tenantId: detail.tenant.id,
    tenantName: detail.tenant.name,
    country: detail.tenant.country,
    currency: detail.tenant.currency,
    isOwner: detail.membership.isOwner,
    // Union across roles, never intersection — see permissions.ts.
    permissions: unionPermissions(roles),
    recordScopes: roles
      .map((r) => r.recordScope)
      .filter((s): s is RecordScopeId => s !== null),
    availableTenants: memberships.map((m) => m.tenant),
  };
});

/** For pages that must have a signed-in user. Redirects if not. */
export async function requireContext(): Promise<RequestContext> {
  const ctx = await getContext();
  if (!ctx) redirect("/login");
  return ctx;
}
