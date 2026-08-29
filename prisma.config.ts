import { defineConfig, env } from "prisma/config";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

// Prisma 7 no longer loads .env automatically. Load it here so the CLI
// (validate / generate / migrate) sees DATABASE_URL. Next.js loads .env
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

export default defineConfig({
  // One .prisma file per module. Prisma 7 treats a folder as a schema natively,
  // which keeps a schema that will reach 100+ models navigable.
  schema: "prisma/schema",
  migrations: {
    path: "prisma/migrations",
  },
  // MIGRATE_DATABASE_URL, not DATABASE_URL: migrations run DDL (CREATE POLICY,
  // ALTER TABLE ... FORCE ROW LEVEL SECURITY), which needs table-owner
  // privileges the restricted app role deliberately does not have.
  // DATABASE_URL is the app's own runtime connection -- see
  // src/lib/db/client.ts and scripts/setup-db-role.mjs for why the two must
  // never be the same role.
  datasource: {
    url: env("MIGRATE_DATABASE_URL"),
  },
});
