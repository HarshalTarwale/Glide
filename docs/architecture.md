# Stage 3 — Architecture & Data Model

**Status:** Draft for review — no application code depends on this yet, per the working agreement.
**Date:** 2026-08-25
**Depends on:** [design-research.md](./design-research.md) (document-graph model, four-layer permissions, query-layer separation) and [design-system.md](./design-system.md) (the UI that consumes this layer).

---

## 1. Multi-tenancy

### 1.1 Options considered

| Strategy | Isolation | Ops cost | Migration cost | Tenant cap | Notes |
|---|---|---|---|---|---|
| **Shared DB, `tenant_id` column, app-enforced** | Weakest — one missing `WHERE` leaks data | Lowest | One migration run, ever | Unbounded | What most early SaaS ships, and how most early SaaS gets breached |
| **Shared DB, `tenant_id` column, Postgres RLS-enforced** | Strong — enforced by the database, not by code review | Low | One migration run, ever | Unbounded | RLS makes the missing-`WHERE` bug structurally impossible |
| **Schema-per-tenant** | Strong, and gives clean per-tenant export/deletion | Medium — migrations must run across every schema | N migration runs per release | Low thousands before catalogue bloat hurts planner performance | What enterprise buyers sometimes explicitly ask for |
| **Database-per-tenant** | Strongest | High — connection pooling, backup, and monitoring all multiply per tenant | N migration runs, N databases | Hundreds, without serious platform investment | Overkill pre-revenue; the right endpoint for a handful of whale customers later |

### 1.2 Decision: shared database, `tenant_id`, enforced by Postgres RLS

Confirmed from the master plan. Cheapest to run on Neon's free/scale tiers, and RLS closes the exact failure mode — a service function that forgets to scope a query — that has caused real-world multi-tenant breaches. The cost is paid once, in schema and session setup, not per query.

**Migration path preserved:** because every table already carries `tenant_id`, moving a specific enterprise tenant to schema-per-tenant or database-per-tenant later is a data-migration script, not a rewrite. Nothing in the application layer needs to know which strategy is active underneath.

### 1.3 Mechanism

Every tenant-scoped table has RLS enabled and a policy against a session-local Postgres setting:

```sql
ALTER TABLE sales_order ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON sales_order
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
```

Every request sets that variable, scoped to the transaction, before running any query:

```sql
BEGIN;
SET LOCAL app.current_tenant_id = '...';
-- all queries in this transaction are now tenant-scoped, even a bare SELECT *
COMMIT;
```

`SET LOCAL` (not `SET`) is deliberate — it is transaction-scoped, so it cannot leak across requests sharing a pooled connection. This is implemented once, in a Prisma client extension (§3.3), not repeated per query.

**Driver constraint that shapes the Prisma choice:** Neon's HTTP driver (`neon-http`) does not support interactive transactions, so it cannot run `SET LOCAL` + query + `COMMIT` as one unit. Glide uses the **WebSocket-based Neon adapter** (`@prisma/adapter-neon` over `@neondatabase/serverless`'s `Pool`), which does. This is a real constraint, not a preference — the wrong driver silently breaks tenant isolation.

**Rows that predate tenant context** — platform tables like `Country`, `Currency`, `TaxRegime` — are not tenant-scoped at all; they carry no `tenant_id` and no RLS policy, since they're shared reference data.

**Verified in production (2026-08-29), and a real gotcha found along the way:** Neon's default role (`neondb_owner` on this project) has Postgres's `BYPASSRLS` attribute. Per Postgres semantics, `BYPASSRLS` overrides `FORCE ROW LEVEL SECURITY` — it is a stronger bypass than table ownership, and FORCE does nothing against it. Connecting the app as the Neon default role would have made every policy in this section inert while looking, from the migration output, completely correct.

The fix, applied via `scripts/setup-db-role.mjs`: a second Postgres role (`glide_app`) with `LOGIN` but explicitly `NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS`. **The application always connects as this role.** Schema migrations alone keep using the original owner connection (`MIGRATE_DATABASE_URL`), since DDL — including `CREATE POLICY` and `ALTER TABLE ... FORCE ROW LEVEL SECURITY` themselves — needs table-owner privileges this restricted role deliberately does not have.

This split is why `prisma.config.ts`'s datasource and `src/lib/db/client.ts`'s runtime connection are configured from two different environment variables rather than one. The isolation test (`tests/rls-isolation.test.ts`) is what caught this — it failed against the owner connection and passed once `DATABASE_URL` pointed at `glide_app`, which is exactly the failure mode the test exists to catch.

---

## 2. Authentication & the permission model

### 2.1 Auth

**Auth.js v5** (`@auth/prisma-adapter` for Neon/Postgres), credentials + Google, in front of the DAL described in §3. Confirmed from the master plan — no per-MAU cost, and the tenant/session shape is exactly what a `SET LOCAL` needs.

- Session is a signed JWT carrying `userId` and the active `tenantId` (a user can belong to more than one tenant; switching tenants is a session refresh, not a re-login).
- `proxy.ts` (Next 16's renamed `middleware.ts`, confirmed against the bundled docs) does only the **optimistic check** — is there a valid session at all — and redirects unauthenticated requests to `/login`. Next's own guidance is explicit that Proxy is not a full authorization layer; the real check happens server-side per request, in the DAL.

### 2.2 Data Access Layer, per Next's own security guidance

The bundled Next 16 docs (`node_modules/next/dist/docs/01-app/02-guides/data-security.md`) recommend exactly the shape the master plan already called for: a server-only Data Access Layer that performs authorization and returns minimal DTOs, rather than authorization checks scattered through components. Glide's service layer (§3.4) *is* this DAL — the two were designed independently and turned out to be the same thing, which is a good sign.

### 2.3 Four permission layers, from Stage 1 research

Stage 1 found that Odoo's security model — the most instructive of the four incumbents studied — operates at four layers, and that a generic admin panel only has layer 2. Glide implements all four:

| Layer | Question | Mechanism |
|---|---|---|
| **1. Groups** | Who is this user? | `Role`, `Membership` (user ↔ tenant ↔ role[], many-to-many — a user can hold several roles) |
| **2. Entity access** | May they CRUD this *kind* of thing? | `module:resource:action` permission strings on each `Role`, e.g. `sales:order:create` |
| **3. Record scope** | *Which rows* of that entity? | A predicate function per role (e.g. `salesperson_id = :userId`), composed into the query alongside the RLS tenant predicate |
| **4. Field visibility** | May they see *this column*? | A field-visibility map per role, applied in the DTO serializer before data leaves the server |

**Union semantics, confirmed from research:** a user with multiple roles gets the *union* of their permissions, never the intersection — matching Odoo. A user who is both "Sales Rep" and "Warehouse Lead" gets everything either role grants.

**Layer 3 rides on the RLS machinery already built for tenancy** — the same `SET LOCAL` + policy pattern, with an additional predicate beyond `tenant_id`, rather than a parallel access-control system. This was the explicit refinement Stage 1 research made to the original plan.

**Layer 4 is enforced in the DTO layer**, never by hiding a field in a React component. `assertFieldVisible(role, 'sales_order.margin')` runs server-side before the value is serialized. A client-only hide is not a permission — it's decoration.

### 2.4 What ships in P0 vs. deferred

Per the Stage 1 open questions, resolved with my recommendation and no objection raised:

- **P0**: layers 1, 2, and 3 (groups, entity ACL, record scope) — record scope because it's free on top of the RLS we're building regardless.
- **P1+**: layer 4 (field-level visibility) gets its serializer machinery once a real field worth hiding exists (e.g. cost/margin on a sales order in P3).
- Chatter: audit log + attachments in P0; comments in P1; scheduled activities alongside CRM later.

---

## 3. Application architecture

### 3.1 Database & ORM

**Neon Postgres** + **Prisma 6**, via `prismaSchemaFolder` (preview-stabilized in Prisma 6) so the schema is split one file per module (`prisma/schema/core.prisma`, `inventory.prisma`, `sales.prisma`, `invoicing.prisma`, …) instead of one unmanageable file.

Connection: `@prisma/adapter-neon` (GA since Prisma 6.16) wrapping the Neon serverless driver's WebSocket `Pool` — required, not just preferred, because RLS's `SET LOCAL` needs a real interactive transaction, which Neon's HTTP driver cannot provide.

```ts
// src/lib/db/client.ts (shape, not final code)
import { Pool, neonConfig } from "@neondatabase/serverless";
import { PrismaNeon } from "@prisma/adapter-neon";
import ws from "ws";

neonConfig.webSocketConstructor = ws;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
export const prisma = new PrismaClient({ adapter: new PrismaNeon(pool) });
```

### 3.2 Money and quantities

Confirmed from the master plan: Postgres `NUMERIC(19,4)` for money, `NUMERIC(19,6)` for quantities, mapped to Prisma `Decimal`, never `Float`. Minor-unit integers (storing cents) were considered and rejected — multi-currency exponents vary (JPY has 0 decimal places, JOD has 3), so a single "multiply by 100" rule is wrong for a subset of Glide's priority countries (AE dirhams behave like INR/USD, but the pattern doesn't generalize, and `NUMERIC` sidesteps the whole class of bug).

### 3.3 Tenant-scoped Prisma client

A Prisma Client Extension wraps every query in a transaction that opens with `SET LOCAL app.current_tenant_id`, using the tenant id resolved from the session in the DAL. This is the **single choke point** for tenant isolation — no service function ever writes `WHERE tenant_id = ...` by hand, and none needs to, because the database refuses to return other tenants' rows regardless.

```ts
// src/lib/db/tenant-client.ts (shape)
export function forTenant(tenantId: string) {
  return prisma.$extends({
    query: {
      $allModels: {
        async $allOperations({ args, query }) {
          return prisma.$transaction(async (tx) => {
            await tx.$executeRawUnsafe(`SET LOCAL app.current_tenant_id = '${tenantId}'`);
            return query(args);
          });
        },
      },
    },
  });
}
```

(Illustrative — the real implementation parameterizes the tenant id safely rather than string-interpolating it; shown here to convey the shape, not as final code.)

### 3.4 Service layer (the DAL)

Every mutation and every non-trivial read goes through a service function in `src/server/<module>/`, never directly through Prisma from a route handler or Server Action:

```
assertPermission(role, "sales:order:confirm")
  → validate input with Zod
  → run inside the tenant-scoped client (§3.3), record-scope predicate applied (§2.3)
  → mutate
  → write AuditLog entry
  → emit domain event
  → return a minimal DTO (never the raw Prisma row)
```

This is the shape Next's own data-security guide recommends, applied to a multi-tenant ERP instead of a single-user app.

### 3.5 API structure

- **Internal**: React Server Components read directly through the DAL; mutations go through Server Actions, which call the same service functions. No internal REST round-trip — this is free type safety Next already gives us.
- **External**: versioned REST at `/api/v1/*`, route handlers calling the *same* service functions, so there is exactly one authorization and validation path regardless of caller. Every `POST` requires an idempotency key (confirmed from the master plan) — safe retries for webhook-driven integrations.
- **Validation**: Zod schemas shared between the Server Action and the REST route handler for a given operation — one contract, two transports, confirmed from the master plan.

### 3.6 Query layer

Already built in Stage 2 (`src/lib/query/record-query.ts`) as a client-side evaluator with server-matching semantics. In P1 the server-side implementation compiles a `RecordQuery` into a Prisma `where`/`orderBy`/`skip`/`take`, running through the same tenant-scoped client and record-scope predicate as every other query. No new abstraction — the same `RecordQuery` shape that drives the URL and saved views on the client drives the actual SQL on the server.

---

## 4. Localization & tax engine

Already built in Stage 2 (`src/lib/i18n/countries.ts`, `src/lib/format.ts`) as the *display* layer. This section defines the *computation* layer it will call into starting P1.

### 4.1 Interface

```ts
interface TaxRegime {
  id: TaxRegimeId; // "GST_IN" | "VAT_GB" | "VAT_EU" | "VAT_AE" | "SALES_TAX_US" | "NONE"
  computeTax(
    lines: TaxableLine[],
    seller: Address,
    buyer: Address,
    settings: TenantTaxSettings
  ): TaxBreakdown[];
}
```

One pure function per regime, unit-tested against golden cases (confirmed testing strategy from the master plan). A new country is a new implementation of this interface plus a `CountryPack` row — never a change to invoicing, sales, or any UI.

### 4.2 The five v1 regimes, and what "done" means for each

| Regime | Core logic | v1 scope boundary |
|---|---|---|
| **India GST** | Intra-state → CGST+SGST split; inter-state → IGST. Place of supply from buyer's registered state. HSN/SAC per line. Reverse charge flag. | Full. This is the most-used regime given the priority ordering and my own locale, so it gets the most scrutiny in testing. |
| **UK VAT** | Standard/reduced/zero/exempt rate per product. Reverse charge for cross-border B2B. | Full for domestic; EU-post-Brexit edge cases (OSS-adjacent) deferred. |
| **EU VAT** | Per-member-state rate, keyed off buyer country for B2C, reverse charge for B2B. | Rate table covers Germany + the 4 largest markets at launch; full 27-state table before EU GA. |
| **UAE VAT** | Flat 5%, designated-zone exemption. | Full — genuinely the simplest of the five. |
| **US sales tax** | State + county + city rate stack, origin/destination sourcing. | **Manually configured jurisdiction rates only.** Full nexus-aware automatic sourcing is its own product (this is what Avalara/TaxJar sell); a v1 tenant configures their own rate table. An adapter to a real tax API is a P6+ candidate, not a v1 blocker. |

This scope boundary was stated in the master plan and is repeated here because it's the one place in the tax engine where "done" could silently mean two different things — flagging it explicitly rather than letting it be assumed.

### 4.3 Multi-currency

Tenant has a base currency (set at signup, from their country); each document may be issued in a different currency. Exchange rate is captured **at the document's date** and stored on the document — never looked up live at render time, so a posted invoice's numbers never silently change. Both document-currency and base-currency amounts are stored side by side, so tenant-wide reporting always has a common currency to sum against.

---

## 5. Cross-module data model

High-level only — full column-level schemas are written per-phase, immediately before that phase's migration, not speculatively now.

### 5.1 Platform (P0)

`Tenant` → `Company` (1:N — a tenant may run several legal entities, confirmed by both Odoo and NetSuite in Stage 1 research) → `Membership` (links `User` ↔ `Tenant` ↔ `Role[]`) → `Role` (holds permission strings + record-scope predicate id) → `AuditLog`, `ApiKey`, `NumberSequence` (per company/doc-type/fiscal-year), `Attachment`, `Invitation`.

Reference data, tenant-agnostic: `Country`, `Currency`, `ExchangeRate`, `TaxRegime`, `TaxRate`, `UnitOfMeasure`.

Every tenant-scoped table: `id`, `tenant_id`, `created_at`, `updated_at`, `created_by`, `updated_by`, `deleted_at` (soft delete where it makes sense), and a `custom_fields JSONB` column (confirmed from Stage 1 research — the seam ships now, the editor UI doesn't, per my recommendation on that open question).

### 5.2 Partners (P1)

One `Partner` model serves customer, supplier and contact roles — Odoo's `res.partner` pattern, confirmed adopted in Stage 1 research specifically to avoid Zoho's failure mode of the same person existing as five separate records across apps. `PartnerAddress` (billing/shipping, many per partner), `PartnerTaxInfo` (GSTIN for India, VAT number for UK/EU, TRN for UAE, EIN for US — country-driven field per §4).

### 5.3 Inventory (P2)

`Product`, `ProductVariant`, `Category`, `UnitOfMeasure` conversions, `Warehouse`, `Location`.

**`StockMove`** is the immutable ledger — every quantity change of every kind (receipt, delivery, transfer, adjustment) is a row here, never an edit. **`StockQuant`** (on-hand per product/location) is *derived* from the move ledger, confirmed as a non-negotiable rule from the master plan: a mutable on-hand counter cannot support backdating, traceability, or audit, and retrofitting an immutable ledger under an existing mutable-counter system is a full rewrite, not a migration.

`Lot`/`Serial` for traceable inventory, `StockValuationLayer` (AVCO costing method for v1 — FIFO/standard cost are later options, not a v1 gap since AVCO is the most common default across all four incumbents studied), `ReorderRule`.

### 5.4 Sales (P3)

`Quotation` → `SalesOrder` → `SalesOrderLine` → `Delivery` (each delivery line links back to the `StockMove`(s) it generated).

**Every order line carries `qty_ordered`, `qty_delivered`, `qty_invoiced`** — confirmed as the single most important schema requirement to come out of Stage 1 research. Document-level status (`draft` / `confirmed` / `partially_delivered` / `delivered` / `invoiced` / `cancelled`) is a *derived* value computed from these three numbers, never a column that can drift out of sync with reality. This is already reflected in the Stage 2 mock data and UI (`src/lib/mock/sales-orders.ts`), which was deliberately built with partial-fulfilment states so the design system would be tested against the real shape of the problem, not a simplified one.

`SalesOrder` also carries an **invoicing policy** (`invoice_ordered` | `invoice_delivered`) per the Stage 1 finding that this must be a first-class setting, not a hardcoded flow — required for the advance/deposit invoicing pattern common in both Indian B2B (advance against PO) and international trade (deposit before manufacture).

`PriceList` (per customer segment or currency), order state machine (server-defined, confirmed — drives the `StatusStepper` and the action buttons already built in Stage 2, never the other way around).

### 5.5 Invoicing (P4)

`Invoice` → `InvoiceLine` → `TaxBreakdown` (the computed output of §4.1, stored on the posted document so it never recalculates differently later) → `CreditNote` (the only mechanism for correcting a posted invoice — documents are immutable once posted, confirmed from the master plan) → `Payment` → `PaymentAllocation` (a payment can partially settle several invoices, and an invoice can be settled by several payments — genuinely many-to-many, not a simple FK).

**Domain event on posting:** confirmed from the master plan — posting an invoice emits an event that nothing yet subscribes to. This is what lets a double-entry GL module get added in P6+ purely as a new subscriber, without ever touching invoicing code again. The event bus itself is intentionally the simplest thing that could work for P0–P5 — an in-process emitter, not a message queue — since there's exactly one process and zero external subscribers until GL exists.

### 5.6 The two rules that prevent an expensive rewrite

Restated here because they are the two decisions in this entire document most likely to be quietly violated under deadline pressure, and the ones a rewrite would trace back to:

1. **Stock on-hand is derived from the move ledger, never a mutable counter.**
2. **Posting a document emits a domain event; nothing about that document's own code should ever need to know who's listening.**

---

## 6. Engineering standards

Confirmed from the master plan, stated once here as the standard every module is held to:

- Every mutation: `assertPermission` → Zod validation → tenant-scoped transaction → audit log → domain event (§3.4).
- Documents are immutable after posting; corrections are reversal documents, never edits (§5.5).
- Idempotency keys on every REST `POST` (§3.5).
- Permissions as `module:resource:action` strings, checked server-side always; `PermissionGate` on the client is UX, not security (§2.3–2.4, and the Stage 2 `nav-config.ts` `permission` field already anticipates this).
- Async `params`/`searchParams`, `proxy.ts` not `middleware.ts`, Turbopack, Cache Components — Next 16 specifics, confirmed against the bundled docs in this session (§1.2, §2.1).

---

## 7. Open items carried to Stage 4

1. **Domain event bus**: in-process emitter is the P0–P5 answer per §5.5. Revisit if a second in-process subscriber shows up before P6, since two consumers is usually the point an in-process emitter starts being the wrong tool.
2. **EU VAT rate table completeness**: full 27-member-state coverage is explicitly not a P1 requirement (§4.2) — confirm this is acceptable for whichever specific EU customers materialize first, since "Europe" as a priority market is broader than any v1 rate table can be.
3. **Record-scope predicate authoring**: P0 ships the mechanism; the actual predicates per role (e.g., "salesperson sees only their own orders") get authored module-by-module as each module's roles are defined, starting P1.

---

## Sources

- Next.js 16 — Proxy (formerly Middleware) *(bundled docs, `node_modules/next/dist/docs/01-app/01-getting-started/16-proxy.md` — no public URL, ships inside the `next` package)*
- Next.js 16 — Data Security guide *(bundled docs, `node_modules/next/dist/docs/01-app/02-guides/data-security.md`)*
- Next.js 16 — Authentication guide *(bundled docs, `node_modules/next/dist/docs/01-app/02-guides/authentication.md`)*
- [@prisma/adapter-neon — npm](https://www.npmjs.com/package/@prisma/adapter-neon)
- [Prisma × Neon official docs](https://www.prisma.io/docs/orm/v6/overview/databases/neon)
- [Connect from Prisma to Neon — Neon Docs](https://neon.com/docs/guides/prisma)
- [Postgres RLS for Multi-Tenant SaaS, the production pattern](https://theroadtoenterprise.com/blog/postgres-rls-multi-tenant-saas)
- [Securing multi-tenant apps with RLS + Prisma](https://medium.com/@francolabuschagne90/securing-multi-tenant-applications-using-row-level-security-in-postgresql-with-prisma-orm-4237f4d4bd35)
- [Multi-tenant DB schema with RLS — 2026 guide](https://nileshblog.tech/multi-tenant-database-rls/)
