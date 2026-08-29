import { defineConfig } from "prisma/config";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

// Prisma 7 no longer loads .env automatically. Load it here so the CLI
// (validate / generate / migrate) sees these vars. Next.js loads .env
// on its own for the running app, so this is CLI-only.
for (const file of [".env.local", ".env"]) {
  const path = resolve(process.cwd(), file);
  if (!existsSync(path)) continue;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const match = /^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/i.exec(line);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key] !== undefined) continue;
    process.env[key] = rawValue.trim().replace(/^["']|["']$/g, "");
  }
}

/**
 * MIGRATE_DATABASE_URL, falling back to DATABASE_URL, falling back to an
 * obviously-fake placeholder.
 *
 * `prisma generate` runs on every `npm install` (see the postinstall script)
 * and NEVER connects to a database — it only reads the schema to emit the
 * client. Throwing here when no URL is set would make `npm install` fail in
 * any environment that has not yet been given database credentials (a fresh
 * clone, CI running unit tests, a Vercel Preview build), for a step that does
 * not need them. That is a build failure with a misleading cause.
 *
 * So: never throw. Commands that genuinely need a connection —
 * `prisma migrate`, `prisma db push`, `prisma studio` — will fail on their
 * own with a clear connection error naming the `.invalid` host below, which
 * points straight at the missing environment variable. `.invalid` is a
 * reserved TLD (RFC 2606) guaranteed never to resolve, so this can never
 * accidentally reach a real database.
 *
 * MIGRATE_DATABASE_URL is preferred over DATABASE_URL because migrations run
 * DDL that needs table-owner privileges the app's restricted runtime role
 * deliberately does not have. See scripts/setup-db-role.mjs.
 */
const PLACEHOLDER_URL = "postgresql://unset:unset@unset.invalid:5432/unset";

function datasourceUrl(): string {
  return process.env.MIGRATE_DATABASE_URL ?? process.env.DATABASE_URL ?? PLACEHOLDER_URL;
}

export default defineConfig({
  // One .prisma file per module. Prisma 7 treats a folder as a schema natively,
  // which keeps a schema that will reach 100+ models navigable.
  schema: "prisma/schema",
  migrations: {
    path: "prisma/migrations",
  },
  // Table-owner privileges are needed for real DDL (`prisma migrate`, which
  // runs CREATE POLICY / ALTER TABLE ... FORCE ROW LEVEL SECURITY), so
  // MIGRATE_DATABASE_URL is preferred here. See src/lib/db/client.ts and
  // scripts/setup-db-role.mjs for why the app's own runtime connection
  // (DATABASE_URL) must be a DIFFERENT, unprivileged role.
  datasource: {
    url: datasourceUrl(),
  },
});
