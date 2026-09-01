# Glide

Multi-tenant ERP — inventory, sales and invoicing for growing businesses.
Next 16 · React 19 · Tailwind v4 · Prisma 7 · Neon Postgres.

## Quick start

```bash
npm install
cp .env.example .env
# Fill in MIGRATE_DATABASE_URL with your Neon owner connection string,
# and generate AUTH_SECRET (npx auth secret).
node scripts/setup-db-role.mjs    # creates the restricted app role; writes DATABASE_URL for you
npm run db:setup                  # migrate + seed reference data
npm run dev                       # http://localhost:3000
```

**Do not point `DATABASE_URL` at the Neon owner connection.** Neon's default
role has `BYPASSRLS`, which silently disables every tenant-isolation policy —
see "Architecture in one screen" below. `setup-db-role.mjs` creates the
correct restricted role and writes both env vars for you; running it is not
optional.

Without a `DATABASE_URL` the app still runs, in **preview mode**: the shell and
every screen render against demo data so the design system stays inspectable.
A banner says so. Sign-in activates the moment a real database is connected.

## Scripts

| Script | What it does |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` | Production build |
| `npm test` | Vitest — permissions + RLS isolation |
| `node scripts/setup-db-role.mjs` | Create/verify the restricted app role (run once per database) |
| `npm run db:migrate` | Apply migrations (`prisma migrate deploy`), as the Neon owner |
| `npm run db:seed` | Seed countries and currencies |
| `npm run db:setup` | Migrate then seed |
| `npm run db:studio` | Prisma Studio |
| `npm run db:rls` | Regenerate the RLS policy migration from the schema |

## Architecture in one screen

- **Tenant isolation** is enforced by Postgres Row-Level Security, not by
  application code. `withTenant()` in `src/lib/db/tenant-client.ts` is the only
  place tenant scope is set; a forgotten `WHERE` clause cannot leak data.
- **`FORCE ROW LEVEL SECURITY` is mandatory** — a table owner bypasses `ENABLE`-only RLS.
- **The app must NOT connect as Neon's default role.** That role has `BYPASSRLS`,
  which overrides even `FORCE`. The app runs as a separate, restricted role
  (`glide_app`) created by `scripts/setup-db-role.mjs`; migrations alone use
  the owner connection. This was a real, verified incident — see
  `docs/architecture.md` §1.3.
- **The WebSocket Neon driver is mandatory** — `neon-http` cannot run
  interactive transactions, so `SET LOCAL` would never reach the query.
- **Permissions have four layers**: roles → entity ACL → record scope → field
  visibility. Server-side `assertPermission()` is the boundary; the client
  `<PermissionGate>` is UX only.
- **The query layer is separate from the table renderer**, so kanban and pivot
  views cost days rather than months later.

After adding tenant-scoped models: `npm run db:rls` to regenerate policies.

## Docs

`docs/` is the source of truth and persists across sessions.

| Doc | Contents |
|---|---|
| [design-research.md](docs/design-research.md) | Odoo / Zoho / NetSuite / Dynamics teardown |
| [design-system.md](docs/design-system.md) | Tokens, type, components, screen archetypes |
| [architecture.md](docs/architecture.md) | Multi-tenancy, auth, data model, tax engine |
| [roadmap.md](docs/roadmap.md) | Phased build order and per-phase done criteria |
| [user-guide/](docs/user-guide/README.md) | End-user docs — signing up, roles, and every module, written for the person using Glide, not building it |
