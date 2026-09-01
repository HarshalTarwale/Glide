# Operations

Runbook-style notes for running Glide in production. Not end-user
documentation (see `docs/user-guide/`) and not the architecture rationale
(see `docs/architecture.md`) — this is "what do I actually do" for the
person operating the deployment.

## Backups & disaster recovery

Two layers, deliberately: Neon's own continuous backup for the common case
(bad migration, accidental delete, "what did this row look like yesterday"),
and a periodic portable export for the uncommon one (losing the Neon
project itself).

### Layer 1 — Neon point-in-time recovery (primary, automatic)

Neon continuously archives WAL, so any point within your plan's retention
window can be recovered without you doing anything to enable it — it is on
by default. What to actually do:

1. **Confirm your retention window.** Neon Console → your project →
   Settings → Backup/restore (retention varies by plan — verify it covers
   how far back you'd realistically need to recover). Free-tier retention
   is short; a paying plan should be sized to your actual risk tolerance.
2. **To recover:** Neon Console → your project → Branches → create a new
   branch "as of" a specific timestamp, or restore. This creates an
   independent, queryable copy at that point in time — inspect it, pull
   what you need, or promote it, before touching production.
3. **Practice this once**, before you need it for real: create a
   time-travel branch, run `npm run db:migrate` and `npm run db:seed`
   against it, confirm the app boots pointed at it. A restore procedure
   that has never been exercised is not a restore procedure.

### Layer 2 — portable export (supplementary, manual/scheduled)

PITR protects you from a bad write. It does not protect you from losing
access to the Neon account itself, and it does not give you a file you can
hand to a different Postgres provider. `scripts/backup-db.mjs` (`npm run
db:backup`) produces that file: a `pg_dump --format=custom` snapshot to
`backups/<timestamp>.dump`, using `MIGRATE_DATABASE_URL` (the owner role —
the app's own restricted role cannot do a full dump).

Requires the PostgreSQL client tools locally (`pg_dump` on PATH) — not a
project dependency, install it the way you'd install `git`. See the
comment at the top of the script for per-OS install commands.

To restore a `.dump` file to any Postgres database:

```bash
pg_restore --clean --if-exists --no-owner --dbname="<target-connection-string>" backups/glide-<timestamp>.dump
```

Run `npm run db:backup` on a schedule (cron, a CI job, whatever the
deployment already has) and ship the output somewhere OTHER than the
machine running the job — S3, GCS, wherever. A backup stored next to the
thing it backs up protects against nothing.

**Status:** the script's failure path is verified (missing `pg_dump`
fails with a clear, actionable message rather than an obscure crash — see
its own error handling). The success path — an actual dump-and-restore
round trip — has not been run against a live database in this environment,
since the PostgreSQL client tools aren't installed here. Run it once for
real, on a machine that has `pg_dump`, before relying on it.

## Error tracking

Not yet wired up — needs a Sentry (or equivalent) account and DSN.

## Background jobs

No job queue exists yet. Nothing in the product currently needs one (no
outbound email, no webhook processing, nothing scheduled) — see
`docs/roadmap.md`'s P5 section for why this is deliberately deferred
rather than built speculatively.
