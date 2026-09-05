# Glide

**One system to run your business — inventory, sales, invoicing, accounting, CRM, procurement, HR, and manufacturing, in one place, with the tax rules of your country built in.**

Every customer's data is isolated at the database level using Postgres Row-Level Security, not just application code — the same standard banks and fintechs hold themselves to.

---

## What is Glide?

Most growing businesses end up duct-taping together a spreadsheet for inventory, a separate invoicing tool, a CRM nobody updates, and a WhatsApp group for the warehouse. Each piece works alone but none of them talk to each other, so nothing adds up and nobody trusts the numbers.

**Glide is a single, connected system of record.** A sale updates your stock automatically. An invoice books the right revenue and tax the moment it's issued. A shipment recognizes the cost of goods sold automatically. A lead becomes a real customer with one click. Every number on every screen is real and traceable back to the transaction that created it — nothing is estimated, nothing is manually reconciled at month-end.

It's built for **any country from day one**: sign up as a business in India, the US, the UK, the UAE, or the EU, and Glide already knows your currency, number formatting, and tax rules (GST, VAT, or sales tax) without any configuration.

---

## Getting started — for a business owner, in plain English

You don't need a developer to start using Glide. Here's the whole process:

1. **Go to the signup page** and fill in your business name, your country, your name, email, and a password.
2. **Submit the form.** That's it — your organisation is created instantly, and you're signed in as the **Owner**, with full access to everything. Glide automatically sets up a default warehouse, standard units of measure, and the correct tax rates for your country, so you're not starting from a blank slate.
3. **Fill in your company details** under **Settings** — your legal name, address, and tax ID (GSTIN, VAT number, EIN, whatever your country calls it).
4. **Invite your team.** Go to **Settings → Members → Invite member**, enter their email, and pick what they're allowed to do (see *Roles & permissions* below). They'll get a real email with a link to join — no manual setup on their end.
5. **Add what you sell and who you sell to** — your products (with cost and selling price) and your contacts (customers and suppliers) are the foundation everything else is built on.
6. **Start working.** Receive stock, create a sales order, ship it, invoice it, get paid — each step is one click from the last, and every number updates everywhere else automatically.

That's the entire onboarding process. No CSV imports required to get going, no IT ticket, no waiting for a sales call.

---

## Everything Glide does, in plain terms

| Module | What it does for you | Where to find it |
|---|---|---|
| **Inventory** | Tracks exactly how much stock you have, in every warehouse, valued correctly at all times. Every stock change (received, sold, adjusted, moved) is logged permanently — nothing is ever a mystery. | Sidebar → *Inventory* / *Stock* |
| **Sales** | Turn a quote into a confirmed order, ship it, and track exactly what's been delivered vs. what's still owed to the customer. | Sidebar → *Sales* |
| **Invoicing** | Raise invoices from an order or standalone, with the right tax automatically calculated for your country. Track who owes you money and for how long (AR Aging), record payments, and issue credit notes for corrections. | Sidebar → *Invoices* / *Payments* |
| **Accounting (General Ledger)** | A real double-entry books system running underneath everything else — every sale, purchase, and payment posts the correct journal entry by itself. Get a Trial Balance, Income Statement, and Balance Sheet without hiring a bookkeeper to prepare them. | Sidebar → *Chart of Accounts* / *Journal Entries* / *Reports* |
| **CRM** | Track leads from first contact through to a closed deal, with a visual pipeline board. Convert a promising lead into a real customer in one click. | Sidebar → *Leads* / *Pipeline* |
| **Procurement** | The buying side of the business: purchase orders, receiving stock from suppliers, supplier bills, and paying them — with the same rigor as the sales side. | Sidebar → *Purchase Orders* / *Bills* |
| **HR** | A simple employee directory with departments and a leave request/approval workflow, so time-off doesn't happen over text message. | Sidebar → *Employees* / *Leave Requests* |
| **Manufacturing** | Define what a product is made from (a Bill of Materials), then create a work order to build it — Glide automatically consumes the right raw materials and adds the finished product to stock, costed correctly. | Sidebar → *Bills of Materials* / *Work Orders* |
| **Business Insights** | One dashboard showing revenue trends, your best customers and products, what's owed both ways, and what's running low on stock — the questions an owner actually asks. | Sidebar → *Business Insights* |
| **Roles & permissions** | Every teammate gets exactly the access their job needs — a warehouse worker can't see pricing, a sales rep only sees their own deals, an accountant sees the books but not HR. Nothing is all-or-nothing. | Settings → *Members* / *Roles* |
| **Audit log** | Every important change anyone makes is recorded — who did what, and when — so you always know what happened and can prove it. | Sidebar → *Audit Log* |

Every module talks to every other module automatically. Nothing needs to be re-entered twice, and nothing needs a spreadsheet to reconcile.

---

## Why this is different from just gluing tools together

- **One source of truth.** Stock, money, and customer data live in one place — not synced between five different SaaS tools with five different bugs.
- **Real accounting, not an approximation.** Every transaction posts a genuine, balanced, double-entry journal entry the moment it happens — the books are always accurate, not reconstructed at tax time.
- **Correct tax by country, from day one.** GST for India (with the right intra-state vs. inter-state split), VAT for the UK/EU/UAE, and sales tax for the US — configured automatically based on where you signed up.
- **Bank-grade data isolation.** Every customer's data is walled off at the database engine level using Postgres Row-Level Security — not just an `if` statement in the app that a bug could someday bypass.
- **Nothing is a black box.** Every report — a Balance Sheet, a stock valuation, a sales pipeline forecast — is a pure calculation from real underlying records, and every number can be traced back to the transaction that produced it.

---

## For developers

Glide is a modern, production-shaped Next.js application — not a prototype. Everything above is real, working, tested code, not a mockup.

```bash
npm install
cp .env.example .env
# Fill in MIGRATE_DATABASE_URL with your Neon owner connection string,
# and generate AUTH_SECRET (npx auth secret).
node scripts/setup-db-role.mjs    # creates the restricted app role; writes DATABASE_URL for you
npm run db:setup                  # migrate + seed reference data
npm run dev                       # http://localhost:3000
```

**Do not point `DATABASE_URL` at the Neon owner connection.** Neon's default role has `BYPASSRLS`, which silently disables every tenant-isolation policy — see *Architecture* below. `setup-db-role.mjs` creates the correct restricted role and writes both env vars for you; running it is not optional.

Without a `DATABASE_URL` the app still runs, in **preview mode**: the shell and every screen render against demo data so the design system stays inspectable. A banner says so. Sign-in activates the moment a real database is connected.

### Scripts

| Script | What it does |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` | Production build |
| `npm test` | Vitest — 280+ tests, including live-database acceptance gates and Postgres RLS tenant-isolation proofs |
| `node scripts/setup-db-role.mjs` | Create/verify the restricted app role (run once per database) |
| `npm run db:migrate` | Apply migrations (`prisma migrate deploy`), as the Neon owner |
| `npm run db:seed` | Seed countries and currencies |
| `npm run db:setup` | Migrate then seed |
| `npm run db:studio` | Prisma Studio |
| `npm run db:rls` | Regenerate the RLS policy migration from the schema |

### Architecture in one screen

- **Tenant isolation** is enforced by Postgres Row-Level Security, not application code. `withTenant()` in `src/lib/db/tenant-client.ts` is the only place tenant scope is set; a forgotten `WHERE` clause cannot leak data.
- **`FORCE ROW LEVEL SECURITY` is mandatory** — a table owner bypasses `ENABLE`-only RLS.
- **The app must NOT connect as Neon's default role.** That role has `BYPASSRLS`, which overrides even `FORCE`. The app runs as a separate, restricted role (`glide_app`) created by `scripts/setup-db-role.mjs`; migrations alone use the owner connection.
- **Every document-posting action emits a domain event**, and the accounting ledger, stock valuation, and audit log are all independent subscribers to those events — adding a new module never requires editing an old one.
- **Permissions have four layers**: roles → entity ACL → record scope → field visibility. Server-side `assertPermission()` is the boundary; the client `<PermissionGate>` is UX only.
- **Money is `NUMERIC(19,4)`, never floating point.** Quantities are `NUMERIC(19,6)`. Stock on-hand and account balances are always derived from an append-only ledger, never a mutable counter that can drift.

After adding tenant-scoped models: `npm run db:rls` to regenerate policies.

### Docs

`docs/` is the source of truth and persists across sessions.

| Doc | Contents |
|---|---|
| [design-research.md](docs/design-research.md) | Odoo / Zoho / NetSuite / Dynamics competitive teardown |
| [design-system.md](docs/design-system.md) | Tokens, type, components, screen archetypes |
| [architecture.md](docs/architecture.md) | Multi-tenancy, auth, data model, tax engine |
| [roadmap.md](docs/roadmap.md) | Every phase built, what's deliberately deferred, and why |
| [operations.md](docs/operations.md) | Backups/DR, error tracking, background jobs — running Glide, not building it |
| [user-guide/](docs/user-guide/README.md) | End-user docs — signing up, roles, and every module, written for the person using Glide |
