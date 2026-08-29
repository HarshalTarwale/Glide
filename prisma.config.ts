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
 * MIGRATE_DATABASE_URL, falling back to DATABASE_URL.
 *
 * `prisma generate` runs on every `npm install` (see the postinstall script)
 * and does not need a working connection at all — it only reads the schema.
 * But prisma/config's env() helper throws the moment the named variable is
 * unresolved, which would make a Vercel Preview build (which reasonably
 * only sets DATABASE_URL, not the owner credential) fail just to generate a
 * client. Falling back keeps generate/build working everywhere `DATABASE_URL`
 * is set, while `prisma migrate` — which actually needs owner privileges for
 * DDL — still uses MIGRATE_DATABASE_URL whenever it's provided.
 */
function datasourceUrl(): string {
  const url = process.env.MIGRATE_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "Set MIGRATE_DATABASE_URL (preferred) or DATABASE_URL before running any Prisma CLI command."
    );
  }
  return url;
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
