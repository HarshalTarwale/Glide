import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { prisma } from "./client";

/**
 * THE tenant isolation choke point.
 *
 * Every tenant-scoped read and write in the application goes through here.
 * No service function ever writes `where: { tenantId }` by hand — and none
 * needs to, because Postgres refuses to return another tenant's rows
 * regardless of what the query says.
 *
 * How it works:
 *   1. open an interactive transaction
 *   2. SET LOCAL app.current_tenant_id = <uuid>
 *   3. run the caller's work inside it
 *
 * SET LOCAL (not SET) is deliberate: it is transaction-scoped, so the value
 * cannot leak to the next request that borrows the same pooled connection.
 *
 * See docs/architecture.md §1.3 and §3.3.
 */
export type TenantTransaction = Prisma.TransactionClient;

export interface TenantTxOptions {
  /** Milliseconds the transaction may run before Postgres rolls it back. */
  timeout?: number;
  /** Milliseconds to wait for a free connection before giving up. */
  maxWait?: number;
}

/**
 * Prisma defaults to a 5s interactive-transaction timeout, which assumes a
 * database on the same network. Every statement here is a WebSocket round
 * trip to Neon, so a legitimately multi-step operation (signup creates a
 * tenant, company, master data, roles, membership and an audit entry) blows
 * through 5s on a normal connection. 20s is the floor that makes those
 * operations reliable without masking a genuinely stuck transaction.
 *
 * Individual callers can still tighten or extend this per call.
 */
const DEFAULT_TX_OPTIONS: Required<TenantTxOptions> = {
  timeout: 20_000,
  maxWait: 10_000,
};

export async function withTenant<T>(
  tenantId: string,
  work: (tx: TenantTransaction) => Promise<T>,
  options: TenantTxOptions = {}
): Promise<T> {
  assertUuid(tenantId);

  return prisma.$transaction(
    async (tx) => {
      // Parameterised — never string-interpolated. set_config() is used rather
      // than literal `SET LOCAL` precisely because it accepts a bind parameter.
      // The third argument `true` makes it transaction-local.
      await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${tenantId}, true)`;
      return work(tx);
    },
    { ...DEFAULT_TX_OPTIONS, ...options }
  );
}

/**
 * The BOOTSTRAP path: identity without a tenant yet.
 *
 * Resolving which tenant a user belongs to is a chicken-and-egg problem —
 * you cannot read your membership without a tenant context, and you cannot
 * know your tenant without reading your membership. Setting
 * app.current_user_id lets the membership policy admit a user to their OWN
 * membership rows (and the tenants those point at) and nothing else.
 *
 * Use this only to answer "which tenants am I in". Everything after that
 * answer uses withTenant().
 */
export async function withUser<T>(
  userId: string,
  work: (tx: TenantTransaction) => Promise<T>
): Promise<T> {
  assertUuid(userId);

  return prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.current_user_id', ${userId}, true)`;
      return work(tx);
    },
    DEFAULT_TX_OPTIONS
  );
}

/**
 * Escape hatch for platform operations that legitimately run without a
 * tenant context: sign-up before a tenant exists, sign-in, reference data.
 *
 * Named loudly on purpose. If you are reaching for this inside a feature,
 * you almost certainly want withTenant() instead.
 */
export async function withoutTenant<T>(work: (client: typeof prisma) => Promise<T>): Promise<T> {
  return work(prisma);
}

/**
 * The BOOTSTRAP path for an invitation link: identity via a token instead
 * of a signed-in user, for the exact same reason withUser() exists for
 * getContext() -- see migration 00000000000011_invite_token_rls. Whoever
 * holds the token IS the authorization; this admits exactly the one
 * Invitation row it names, nothing else.
 *
 * Use this ONLY to read the invitation (show "you've been invited to X").
 * The actual accept -- creating a Membership, marking the invitation
 * accepted -- runs under withTenant(invitation.tenantId, ...) once that's
 * known, the normal way every other write in the app happens.
 */
export async function withInviteToken<T>(
  token: string,
  work: (tx: TenantTransaction) => Promise<T>
): Promise<T> {
  if (!token || token.length < 16) {
    // Defence in depth, same reasoning as assertUuid: a malformed token
    // means something upstream is broken and should fail loudly.
    throw new Error("Invalid invitation token");
  }

  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.current_invite_token', ${token}, true)`;
    return work(tx);
  }, DEFAULT_TX_OPTIONS);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function assertUuid(value: string) {
  if (!UUID_RE.test(value)) {
    // Defence in depth: set_config is parameterised, but a malformed tenant id
    // means something upstream is broken and should fail loudly, not quietly
    // resolve to "no rows".
    throw new Error("Invalid tenant id");
  }
}
