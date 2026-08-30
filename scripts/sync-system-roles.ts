/**
 * Re-syncs every tenant's built-in (isSystem) roles to match SYSTEM_ROLES in
 * src/lib/auth/permissions.ts.
 *
 * WHY THIS EXISTS: a Role's permissions are a snapshot, written into the
 * database once at signup. SYSTEM_ROLES in code is the source of truth for
 * what a NEW tenant gets -- it is not live-read at request time. Add a new
 * permission string to code (as this session did for
 * "inventory:warehouse:read/write") and every tenant created before that
 * change keeps the OLD permission set until something explicitly re-syncs
 * it. Without this, an Owner on an existing tenant would get a 403 on a
 * brand-new feature their role name says they should have.
 *
 * Matches roles by (tenantId, name, isSystem=true) -- a tenant's custom,
 * non-system roles are never touched. Idempotent: re-running when nothing
 * changed updates nothing.
 *
 * Usage:
 *   npx tsx --env-file=.env scripts/sync-system-roles.ts            # report
 *   npx tsx --env-file=.env scripts/sync-system-roles.ts --apply    # write
 */
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient } from "../src/generated/prisma/client";
import { SYSTEM_ROLES } from "../src/lib/auth/permissions";

neonConfig.webSocketConstructor = ws;

const APPLY = process.argv.includes("--apply");

// Administrative operation across every tenant -- by design no single
// tenant session can do this, so the owner connection is correct here, not
// a workaround. MIGRATE_DATABASE_URL is preferred; DATABASE_URL is a
// fallback for local setups that have not run setup-db-role.mjs yet.
const connectionString = process.env.MIGRATE_DATABASE_URL ?? process.env.DATABASE_URL;
if (!connectionString || connectionString.includes("placeholder") || connectionString.includes("unset.invalid")) {
  console.error("Set MIGRATE_DATABASE_URL (or DATABASE_URL) to a real Neon connection string first.");
  process.exit(1);
}

const pool = new Pool({ connectionString });
const prisma = new PrismaClient({ adapter: new PrismaNeon({ connectionString }) });

async function main() {
  const tenants = await prisma.tenant.findMany({ select: { id: true, name: true } });
  console.log(`${tenants.length} tenant(s).`);

  let changedRoles = 0;

  for (const tenant of tenants) {
    // set_config, then read/write through the SAME scoped client used
    // everywhere else -- this script proves the fix by going through the
    // real RLS predicate, not by trusting the owner connection's bypass.
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("select set_config('app.current_tenant_id', $1, true)", [tenant.id]);

      const { rows: existing } = await client.query(
        `select id, name, permissions, "recordScope" from role where "tenantId" = $1 and "isSystem" = true`,
        [tenant.id]
      );
      const byName = new Map(existing.map((r) => [r.name, r]));

      for (const def of SYSTEM_ROLES) {
        const current = byName.get(def.name);
        if (!current) {
          console.warn(`  ${tenant.name}: role "${def.name}" does not exist -- skipping (not creating new roles here).`);
          continue;
        }

        const currentPerms: string[] = current.permissions ?? [];
        const samePerms =
          currentPerms.length === def.permissions.length &&
          currentPerms.every((p) => def.permissions.includes(p)) &&
          def.permissions.every((p) => currentPerms.includes(p));
        const sameScope = (current.recordScope ?? null) === def.recordScope;

        if (samePerms && sameScope) continue;

        changedRoles++;
        const added = def.permissions.filter((p) => !currentPerms.includes(p));
        console.log(
          `  ${tenant.name} / ${def.name}: ${added.length ? `+${added.join(", ")}` : "recordScope change"}`
        );

        if (APPLY) {
          await client.query(`update role set permissions = $1, "recordScope" = $2 where id = $3`, [
            def.permissions,
            def.recordScope,
            current.id,
          ]);
        }
      }

      await client.query(APPLY ? "COMMIT" : "ROLLBACK");
    } catch (error) {
      await client.query("ROLLBACK");
      console.error(`  FAILED for ${tenant.name}:`, error instanceof Error ? error.message : error);
    } finally {
      client.release();
    }
  }

  console.log(
    changedRoles === 0
      ? "\nEvery tenant's system roles already match SYSTEM_ROLES."
      : `\n${changedRoles} role(s) ${APPLY ? "updated" : "would be updated"}.${APPLY ? "" : " Re-run with --apply to write."}`
  );

  await prisma.$disconnect();
  await pool.end();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
