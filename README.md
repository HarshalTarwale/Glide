# Glide

Multi-tenant ERP — inventory, sales and invoicing for growing businesses.
Next 16 · React 19 · Tailwind v4 · Prisma 7 · Neon Postgres.

## Quick start

```bash
npm install
cp .env.example .env      # then fill in DATABASE_URL and AUTH_SECRET
npm run db:setup          # migrate + seed reference data
npm run dev               # http://localhost:3000
```

Without a `DATABASE_URL` the app still runs, in **preview mode**: the shell and
every screen render against demo data so the design system stays inspectable.
A banner says so. Sign-in activates the moment a real database is connected.

## Scripts

| Script | What it does |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` | Production build |
| `npm test` | Vitest — permissions + RLS isolation |
| `npm run db:migrate` | Apply migrations (`prisma migrate deploy`) |
| `npm run db:seed` | Seed countries and currencies |
| `npm run db:setup` | Migrate then seed |
| `npm run db:studio` | Prisma Studio |
| `npm run db:rls` | Regenerate the RLS policy migration from the schema |

## Architecture in one screen

- **Tenant isolation** is enforced by Postgres Row-Level Security, not by
  application code. `withTenant()` in `src/lib/db/tenant-client.ts` is the only
  place tenant scope is set; a forgotten `WHERE` clause cannot leak data.
- **`FORCE ROW LEVEL SECURITY` is mandatory** — Neon connects as the table
  owner, and an owner bypasses `ENABLE`-only RLS.
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
