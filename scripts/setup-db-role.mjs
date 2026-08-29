/**
 * Creates the restricted application role RLS actually depends on.
 *
 * WHY THIS EXISTS:
 * Neon's default role (typically "<db>_owner") has the Postgres BYPASSRLS
 * attribute. Per Postgres semantics, BYPASSRLS overrides EVEN a table with
 * FORCE ROW LEVEL SECURITY — it is a stronger bypass than table ownership.
 * Connecting the app as the Neon default role means every RLS policy in
 * 00000000000001_rls is silently inert, regardless of how correctly it is
 * written. This was caught by the P0 isolation test.
 *
 * The fix: a second role, with LOGIN but no BYPASSRLS, no SUPERUSER, no
 * CREATEROLE. The app runs as this role at all times. Schema migrations
 * keep using the original (owner) connection, via MIGRATE_DATABASE_URL,
 * since DDL needs table-owner privileges that this restricted role does
 * not have and should not have.
 *
 * Idempotent: safe to re-run. Only sets a password (and prints the resulting
 * connection string) the first time the role is created, so re-running never
 * silently rotates credentials out from under a running app.
 *
 * Usage:
 *   node scripts/setup-db-role.mjs
 * Requires MIGRATE_DATABASE_URL (or DATABASE_URL as a fallback) to be the
 * Neon owner connection string.
 */
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import { randomBytes } from "node:crypto";
import { config as loadEnv } from "dotenv";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

loadEnv();
neonConfig.webSocketConstructor = ws;

const APP_ROLE = "glide_app";
const adminUrl = process.env.MIGRATE_DATABASE_URL ?? process.env.DATABASE_URL;

if (!adminUrl || adminUrl.includes("placeholder")) {
  console.error("Set MIGRATE_DATABASE_URL (or DATABASE_URL) to the Neon owner connection string first.");
  process.exit(1);
}

const pool = new Pool({ connectionString: adminUrl });

// APP_ROLE is a hardcoded constant in this file, never user input, so a
// literal identifier here (rather than a bind parameter) is safe -- and
// necessary, since pg_roles.rolname comparisons against an untyped $1
// confuse the Neon driver's parameter-type inference.
const { rows: existing } = await pool.query(
  `select rolname, rolbypassrls from pg_roles where rolname = '${APP_ROLE}'`
);

let password = null;

if (existing.length === 0) {
  password = randomBytes(24).toString("base64url");
  // Password is parameterised via format(), never string-concatenated, even
  // though it is generated locally and never user input.
  const { rows: sql } = await pool.query(
    `select format(
       'CREATE ROLE %I LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS',
       '${APP_ROLE}', $1::text
     ) as stmt`,
    [password]
  );
  await pool.query(sql[0].stmt);
  console.log(`Created role "${APP_ROLE}" (NOBYPASSRLS).`);
} else if (existing[0].rolbypassrls) {
  // Should never happen since the role is created NOBYPASSRLS above, but if
  // someone flips it in the Neon console, catch it loudly rather than let
  // isolation silently break again.
  console.error(`Role "${APP_ROLE}" exists but has BYPASSRLS set. Fix in the Neon console:`);
  console.error(`  ALTER ROLE ${APP_ROLE} NOBYPASSRLS;`);
  process.exit(1);
} else {
  console.log(`Role "${APP_ROLE}" already exists (NOBYPASSRLS confirmed). Leaving its password unchanged.`);
}

// Idempotent grants — safe, and necessary, to re-run on every schema change
// since new tables are not covered by a grant issued before they existed.
await pool.query(`GRANT USAGE ON SCHEMA public TO ${APP_ROLE}`);
await pool.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${APP_ROLE}`);
await pool.query(`GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ${APP_ROLE}`);
await pool.query(
  `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${APP_ROLE}`
);
await pool.query(`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO ${APP_ROLE}`);
console.log(`Grants applied for "${APP_ROLE}" on all current and future tables in public.`);

// Confirm the flag that actually matters, rather than trusting the CREATE.
const { rows: confirm } = await pool.query(
  `select rolbypassrls from pg_roles where rolname = '${APP_ROLE}'`
);
if (confirm[0]?.rolbypassrls) {
  console.error(`FATAL: "${APP_ROLE}" has BYPASSRLS after setup. Refusing to continue.`);
  process.exit(1);
}
console.log(`Confirmed: "${APP_ROLE}" does NOT have BYPASSRLS. RLS policies will apply to it.`);

await pool.end();

if (password) {
  const url = new URL(adminUrl);
  url.username = APP_ROLE;
  url.password = password;
  const appUrl = url.toString();

  const envPath = resolve(process.cwd(), ".env");
  let env = existsSync(envPath) ? readFileSync(envPath, "utf8") : "";

  // MIGRATE_DATABASE_URL preserves the owner connection for `prisma migrate`.
  if (!/^MIGRATE_DATABASE_URL=/m.test(env)) {
    env = env.replace(/^DATABASE_URL=.*$/m, (line) => `MIGRATE_DATABASE_URL=${JSON.stringify(adminUrl)}\n${line}`);
  }
  // DATABASE_URL becomes the restricted role the app actually runs as.
  env = env.replace(/^DATABASE_URL=.*$/m, `DATABASE_URL="${appUrl}"`);
  writeFileSync(envPath, env);

  console.log("\n.env updated:");
  console.log("  DATABASE_URL          -> glide_app (RLS-enforced, used by the running app)");
  console.log("  MIGRATE_DATABASE_URL  -> neondb_owner (used only by `prisma migrate`)");
}
