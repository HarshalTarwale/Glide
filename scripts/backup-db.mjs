#!/usr/bin/env node
/**
 * Portable, off-Neon backup: a `pg_dump` custom-format export, written to
 * backups/<timestamp>.dump.
 *
 * This is a SUPPLEMENT to Neon's own point-in-time recovery
 * (docs/operations/backups.md), not a replacement for it. PITR is
 * continuous and needs nothing run manually; this script exists for the
 * failure mode PITR does not cover -- losing access to the Neon project
 * itself (account issue, accidental project deletion, wanting to move
 * provider) -- so it deliberately produces a file that restores with
 * standard `pg_restore` against ANY Postgres, not just Neon.
 *
 * Requires the PostgreSQL client tools (`pg_dump` on PATH). Not bundled as
 * an npm dependency -- it is OS-level tooling, the same way `git` is.
 *   macOS:   brew install libpq && brew link --force libpq
 *   Debian:  apt-get install postgresql-client
 *   Windows: https://www.postgresql.org/download/windows/ (or via winget)
 *
 * Uses MIGRATE_DATABASE_URL (the owner role) so the dump is a complete,
 * schema-and-data snapshot -- the restricted app role this app runs under
 * day to day does not have the privileges pg_dump needs for a full export.
 */

import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

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

const databaseUrl = process.env.MIGRATE_DATABASE_URL;
if (!databaseUrl) {
  console.error("MIGRATE_DATABASE_URL is not set. This script needs the owner connection, not the restricted app role.");
  process.exit(1);
}

const outDir = resolve(process.cwd(), "backups");
mkdirSync(outDir, { recursive: true });

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const outFile = resolve(outDir, `glide-${stamp}.dump`);

console.log(`Backing up to ${outFile} ...`);

const pgDump = spawn(
  "pg_dump",
  [
    databaseUrl,
    "--format=custom",
    "--no-owner",
    "--no-privileges",
    "--file", outFile,
  ],
  { stdio: "inherit" }
);

pgDump.on("error", (err) => {
  if (err.code === "ENOENT") {
    console.error(
      "\npg_dump was not found on PATH. Install the PostgreSQL client tools -- see the comment at the top of this script for your OS."
    );
  } else {
    console.error(err);
  }
  process.exit(1);
});

pgDump.on("exit", (code) => {
  if (code === 0) {
    console.log(`Done: ${outFile}`);
    console.log(`Restore with: pg_restore --clean --if-exists --no-owner --dbname=<target-db-url> ${outFile}`);
  }
  process.exit(code ?? 1);
});
