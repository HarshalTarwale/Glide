import "server-only";

import { PrismaNeon } from "@prisma/adapter-neon";
import { neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import { PrismaClient } from "@/generated/prisma/client";

/**
 * Prisma 7 has no Rust query engine — a driver adapter is mandatory.
 *
 * We use the WebSocket-based Neon adapter, NOT neon-http. This is a hard
 * requirement, not a preference: RLS tenant isolation depends on running
 * `SET LOCAL app.current_tenant_id` and the query inside one interactive
 * transaction, and the HTTP driver cannot do interactive transactions.
 * Using neon-http here would make every policy silently no-op.
 * See docs/architecture.md §1.3.
 */
neonConfig.webSocketConstructor = ws;

function createClient() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not set. Copy .env.example to .env and add your Neon connection string."
    );
  }
  return new PrismaClient({
    adapter: new PrismaNeon({ connectionString }),
  });
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function getClient(): PrismaClient {
  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = createClient();
  }
  return globalForPrisma.prisma;
}

/**
 * The UNSCOPED client. RLS still applies to every tenant-scoped table, so
 * queries through this client return zero rows unless a tenant context has
 * been set — it is not a bypass.
 *
 * Only platform code should reach for this directly: sign-up, sign-in,
 * reference-data reads. Everything else goes through withTenant().
 *
 * LAZY on purpose. Connecting eagerly at module scope would mean that merely
 * IMPORTING this file requires DATABASE_URL — which breaks `next build`,
 * since collecting page data imports every route's module graph. A build
 * should not require a runtime secret. Creating the client on first actual
 * property access keeps builds working without credentials while still
 * failing loudly, with the message in createClient(), the moment a real
 * query is attempted without one.
 *
 * The connection itself is still lazy underneath: the Neon Pool does not
 * open a socket until a query runs.
 */
export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, property) {
    const client = getClient();
    const value = Reflect.get(client, property) as unknown;
    // Bind methods to the real client so `this` is correct for
    // $transaction, $executeRaw and the model delegates.
    return typeof value === "function" ? value.bind(client) : value;
  },
});

/** True when a database is configured. Lets the app render without one. */
export function isDatabaseConfigured() {
  return Boolean(process.env.DATABASE_URL) && !process.env.DATABASE_URL?.includes("placeholder");
}
