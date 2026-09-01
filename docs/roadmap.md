# Stage 4 — Module Roadmap & Phased Build Order

**Status:** Draft for review
**Date:** 2026-08-27
**Depends on:** [design-research.md](./design-research.md) · [design-system.md](./design-system.md) · [architecture.md](./architecture.md)

---

## 1. What "done" means

Every phase below ships a **complete vertical slice**. A phase is not done when the UI renders — it is done when all nine of these are true:

1. Prisma schema + migration applied
2. RLS policies on every new tenant-scoped table
3. Service functions (the DAL) with Zod contracts
4. Server Actions **and** `/api/v1` REST endpoints calling those same services
5. List view + record view + create/edit UI, built from the Stage 2 component library
6. Permissions wired — entity ACL and record scope, checked server-side
7. Vitest tests for the domain rules and the RLS isolation guarantee
8. One Playwright e2e covering the phase's happy path
9. Seed data + a docs entry

No phase is called done with a UI shell over a stub. That is the specific failure mode that makes ERP projects look 80% complete for eighteen months.

---

## 2. Dependency order — why this sequence

The build order is not a preference. It follows the direction data flows through the document graph identified in Stage 1 research, and each arrow is a hard dependency:

```
  P0 Foundation ─── tenancy, identity, permissions
        │            (nothing can be scoped to a tenant that doesn't exist)
        ▼
  P1 Master data ── products, partners, warehouses, tax rates
        │            (nothing can be stocked or sold that isn't defined)
        ▼
  P2 Inventory ──── the stock move ledger
        │            (an order cannot reserve or deliver stock that isn't tracked)
        ▼
  P3 Sales ──────── quotes, orders, deliveries
        │            (an invoice needs something to invoice against)
        ▼
  P4 Invoicing ──── invoices, tax, payments
                     (the revenue is real; now it's sellable)
```

**Why Inventory precedes Sales.** A sales order's core behaviour is *reserving and consuming stock*. Building Sales first means either stubbing that out — and rewriting the order lifecycle later — or building a fake inventory inside Sales. Both are worse than waiting one phase.

**Why Invoicing depends on both.** An invoice line draws its quantity from either the order (`invoice_ordered`) or the validated deliveries (`invoice_delivered`), per the invoicing-policy finding in Stage 1. It cannot be built correctly until both sources exist.

**Why Master data is its own phase.** Products, partners, UoM and tax rates are shared by every downstream module. Building them inside Inventory would make Sales depend on Inventory for customer records, which is wrong and would need untangling.

**Why CRM is deferred despite being the flashier demo.** CRM feeds *into* Sales (lead → opportunity → quote). It is upstream in the sales process but downstream in build order, because a pipeline that can't produce a real quote against real products is a toy.

---

## 3. Phases

### P0 — Foundation  ·  **COMPLETE, verified against the live database**

**Scope:** `src/` restructure ✅, design tokens ✅, fonts ✅, optimised brand assets ✅, Neon + Prisma + RLS ✅, Auth.js ✅, Tenant / Company / User / Membership / Role ✅, AppShell ✅, core primitives ✅, ⌘K palette ✅, settings shell ✅, audit log ✅, number sequences (schema ready, UI deferred to the module that first needs it).

**Acceptance gate — PASSED for real, not just in logic:**
- `tests/rls-isolation.test.ts` — tenant A cannot read tenant B's row by primary key, an unscoped query returns zero rows (fails closed), writes are scoped too. All three against live Neon.
- `tests/signup-flow.test.ts` — a real signup creates tenant, company, all 7 seeded roles, Owner membership and an audit entry; duplicate email is rejected.

**A real incident, caught by the isolation test itself:** Neon's default `neondb_owner` role carries Postgres's `BYPASSRLS` attribute, which overrides `FORCE ROW LEVEL SECURITY` outright — every policy in `00000000000001_rls` was silently inert while the app connected as that role. Fixed with a second, unprivileged role (`glide_app`, confirmed `NOBYPASSRLS`) that the app runs as at all times; migrations alone keep using the owner connection, via a separate `MIGRATE_DATABASE_URL`. `scripts/setup-db-role.mjs` creates and verifies this role and is idempotent. Documented in `.env.example` and `README.md` so this cannot silently regress for the next environment.

**Key risk, resolved:** the Neon driver choice (§1.3) — the WebSocket adapter is in use, `SET LOCAL` inside a transaction was confirmed working end to end.

---

### P1 — Master data  ·  *CRUD complete; import/saved-views/comments remain*

**Delivered:** Prisma schema for Partner / Product / Category / UoM / TaxRate /
TaxCategory / PriceList / Warehouse / Location (30 tables total, RLS across all
23 tenant-scoped tables). The five-regime tax engine with 32 golden cases.
Server-side `RecordQuery` compilation. Full CRUD, with a real screen and a
working create/edit form, for all three entities that block P2/P3:

- **Products** — list + create/edit dialog + archive, cost hidden by
  permission layer 4 in the serializer.
- **Contacts (Partner)** — list + create/edit, billing address and primary
  tax registration edited inline in one transaction, archive.
- **Warehouses** — list + create/edit + archive; creating one creates its
  own internal stock location, so P2's move ledger always has somewhere to
  move stock into.

A tenant bootstrap (`bootstrap-tenant.ts`) seeds the units, tax categories,
default rates, price list and warehouse a fresh signup needs before any of
the above is usable — without it, `Product.uomId` being a non-null FK meant
a new tenant could not create a single product. Verified end to end against
live Neon: signed in over HTTP, created/edited/archived rows through the
real service layer, confirmed RLS still scopes every one of them.

**Still open in P1:** CSV import, saved-view persistence, chatter comments.
None of these block P2 — they are usability, not a missing capability a user
cannot work around.

**Scope:** Product, ProductVariant, Category, UnitOfMeasure + conversions, Partner (customer/supplier/contact in one model), PartnerAddress, PartnerTaxInfo, Warehouse, Location, PriceList, TaxRate, and the five country packs' **tax computation** (the display layer already exists from Stage 2).

Also lands here, because P1 is the first phase with enough real rows to justify them:
- server-side `RecordQuery` compilation (the client-side evaluator from Stage 2 gains its SQL twin)
- saved views persisted to a table
- CSV import
- chatter comments (per the Stage 1 open-question resolution)

**Done when:** full CRUD on every entity through `DataTable` + `RecordShell`, CSV import working, and the tax engine's golden-case suite is green for **all five regimes** — India GST intra vs inter-state, UK VAT, EU VAT, UAE VAT, US sales tax with manually configured rates.

*Tax gate status: **green**. 32 golden cases pass across all five regimes.*

**Scope boundary restated:** US sales tax is manually configured jurisdiction rates. No automatic nexus sourcing. Flagged in architecture §4.2 and still awaiting explicit sign-off.

---

### P2 — Inventory  ·  **Acceptance gate PASSED, verified against live Neon**

**Delivered:** `StockMove` (immutable ledger), `StockQuant` (cached on-hand,
atomic increment/decrement only), `StockValuationLayer` (company-wide AVCO),
`Lot` (lot/serial tracking), `ReorderRule`. Four operations — receive,
deliver, transfer, adjust — funnelling through one `recordMove` primitive
so the two non-negotiable rules from architecture §5.6 live in one place
rather than four. A `SELECT ... FOR UPDATE` lock on the source quant makes
the sufficiency check race-free under concurrent moves. `/app/inventory/stock`
report screen: on-hand + AVCO value + low-stock flag per product, one dialog
for all four move types.

**The gate itself, restated and confirmed green:** a receipt raises on-hand,
a delivery lowers it, an adjustment reconciles, valuation matches a
hand-computed AVCO figure, and every one of those numbers is *derived from
the move ledger* — `tests/stock-ledger.test.ts` rebuilds each independently
from `StockMove`/`StockValuationLayer` and asserts equality with the cache.
8/8 pass against live Neon; `tests/avco.test.ts` covers the weighted-average
math itself with 10 dependency-free golden cases.

**Key risk, resolved:** on-hand never became a mutable counter — `StockQuant`
is written only via Prisma's atomic `increment`/`decrement` inside the same
transaction as the `StockMove` row that justifies it, proven by the
rebuild-and-compare tests rather than asserted by comment.

**P2 is now fully closed.** Lot/serial traceability shipped as a report tab
(on-hand per lot, expiry with a 30-day warning flag). `ReorderRule` shipped
with full CRUD, scoped correctly: the existing stock report's low-stock flag
stays on `Product.reorderPoint` (company-wide on-hand vs a tenant-wide
default), since a per-warehouse threshold has no well-defined meaning
against a company-wide sum — a genuinely per-warehouse low-stock report is
a natural addition once a screen needs one, not a forced wiring now.

---

### P3 — Sales  ·  **Acceptance gate PASSED, verified live end to end**

**Delivered:** ONE `SalesOrder` model covering quotation and confirmed-order
states via `status` (not two tables — matches the Stage 2 UI and mock data
exactly). Every line carries `qtyOrdered`/`qtyDelivered`/`qtyInvoiced`.
`Delivery`/`DeliveryLine` link back to the exact `StockMove` each line
generated. Full CRUD screens: list, create (with the editable
`LineItemsEditor` — the piece Stage 2 shipped only read-only), record page
with a real state machine driving `StatusStepper` and the action buttons,
and a Deliver dialog. Confirm/Deliver/Cancel wired to Server Actions with
the same permission gates the service layer itself asserts.

**The gate, restated and confirmed green:** quote → order → delivery
visibly reduces on-hand in Inventory, a partial delivery leaves the order
`partially_delivered` with the remainder tracked, and the header status is
provably derived from line quantities — `tests/sales-orders.test.ts`
proves this against live Neon (6/6), and the flow was additionally driven
through real HTTP as the demo user: create → confirm → partial-deliver,
confirmed on the rendered record page (correct status badges, CGST 9% +
SGST 9% = ₹1,224 from the P1 tax engine, "8 / 20" delivered ratio, a real
three-entry audit trail).

**Two deliberate scope decisions, stated rather than silently implied:**
- **"Stock reservation on confirmation"** (the original Scope line) means
  confirming an order does NOT move stock — nothing has physically
  happened yet. Overselling is prevented at the point stock actually ships
  (`createDelivery`'s `FOR UPDATE` check from P2), not via a soft
  reservation quantity. A true reserved-quantity system (warning a second
  order "37 of these are already promised" before it tries to ship) is
  real, deferred v2 work.
- **Keyboard row navigation** in the line-items editor is native tab-order
  (real `<select>`/`<input>` elements), not custom arrow-key cell movement
  like a spreadsheet. Worth building against real usage feedback, not
  speculatively now.

**A real bug the acceptance test caught before any UI existed:** the P1
GST engine correctly throws when seller/buyer state is missing (place of
supply can't be determined), and a fresh tenant's `Company.region` is null
by default — every Indian sales order would fail until onboarding collects
it. Not a test artifact; documented in the test fixture as the same
precondition a real company must satisfy before its first invoice.

---

### P4 — Invoicing  ·  **Acceptance gate PASSED, verified against live Neon**

**Delivered:** `Invoice` → `InvoiceLine`, `CreditNote` → `CreditNoteLine`, `Payment` → `PaymentAllocation` (genuinely many-to-many, not a simple FK). `Invoice.status` follows the same discipline as `SalesOrder.status`: `draft`/`cancelled` are facts, `posted`/`partially_paid`/`paid` are DERIVED from payment allocations (`src/lib/invoicing/invoice-status.ts`). An invoice is raised from a sales order (`invoice_ordered` vs `invoice_delivered` policy, same as P3) or standalone. Posting is one-way and the invoice becomes immutable from that point — no code path edits a posted invoice's lines; the only correction is a `CreditNote`, prorated from the original line's frozen amounts by quantity fraction, never re-taxed. Payments settle across invoices freely: `recordPayment` accepts allocations at creation time, `allocatePayment` applies an already-recorded payment's unallocated remainder later. AR aging (`src/server/invoicing/ar-aging.ts`) buckets outstanding balances (current / 1–30 / 31–60 / 61–90 / 90+) per partner. PDF via `@react-pdf/renderer`, served at `/api/invoices/[id]/pdf`. `invoice.posted` is emitted through the new in-process domain event bus (`src/server/core/events.ts`) — the P0–P5 "simplest thing that could work" per architecture.md §5.5, with zero subscribers today by design, waiting for the P6+ GL module.

Full UI: invoice list, standalone-create form, record page (Post / Record payment / Credit note / PDF actions, a status stepper, credit-note history), payment list, record page with an allocation dialog, a dedicated multi-invoice payment-recording flow (`/app/payments/new`), and an AR aging report page. The sales order record page gained a real "Create invoice" action, drawing only from what the order still has left to invoice under its own policy.

**The gate, restated and confirmed green:** order → invoice → PDF → payment → AR aging reconciles, a posted invoice cannot be edited, a correction produces a credit note, and one payment can settle parts of three invoices — `tests/invoicing.test.ts` proves all of this against live Neon (6/6), plus `tests/invoice-status.test.ts` (22/22 golden cases for status derivation, money math, payment allocation and aging buckets) and `tests/invoice-pdf.test.ts` (3/3, PDF generation has no database dependency of its own).

**A real, pre-existing bug the acceptance test caught:** `nextDocumentNumber`'s row-creation step used Prisma's `.upsert()`, which is not guaranteed to compile to a single atomic statement inside an interactive transaction. Three invoices created concurrently for the same company (the multi-invoice payment test's own setup) triggered a unique-constraint violation — a real production scenario (two people raising the first document of a fiscal year at the same instant), not a test artifact. `sales-orders.test.ts` never exercised concurrent creation, so this raced silently through P2 and P3. Fixed by replacing the upsert with raw `INSERT ... ON CONFLICT DO NOTHING`, which Postgres guarantees is race-free.

**One architectural gap closed before calling this done:** architecture.md §5.5 specifies the tax breakdown is "stored on the posted document so it never recalculates differently later." The first pass mirrored P3's live-recompute-on-read pattern for the *displayed* breakdown (the stored `taxTotal`/line `taxAmount` were always frozen correctly, but the per-jurisdiction label/rate split shown on screen and in the PDF was not). Added `Invoice.taxBreakdown` (JSON), frozen once by `postInvoice`, read back verbatim by `getInvoice` for anything not still a draft — proven by a test that changes the tenant's configured tax rate *after* posting and asserts the invoice's displayed breakdown is unchanged.

**This is the end of v1.** P0–P4 is the sellable product: a business can define products and customers, track stock, sell it, and get paid — with correct tax in five jurisdictions.

---

### P5 — Hardening & launch  ·  **in progress**

**Scope:** Stripe subscription billing *for Glide itself*, onboarding flow, audit-log UI, index + N+1 pass, background jobs (pg-boss), error tracking, backups, field-level permissions (layer 4), user documentation.

**Done when:** someone who is not us can sign up, pay, and use it unassisted.

The distinction from P4 matters: P4 makes the product work. P5 makes it a business.

**Done so far, verified against live Neon:**

- **Audit-log UI** (`/app/audit`) — the tenant-wide cross-entity screen `core:audit:read` has existed for since P0 but never had a screen (`src/server/core/audit.ts`'s `listAuditLog`/`listAuditEntityTypes`, filterable/sortable/paginated). Caught and fixed a real bug while building it: the list defaulted to `compileQuery`'s stable `id: asc` tiebreaker instead of newest-first, since that tiebreaker means `compileQuery`'s `orderBy` is never actually empty.
- **Field-level permissions (layer 4)** — generalized the ad-hoc `canSeeCost()` P1's `products.ts` shipped with into a shared primitive (`lib/auth/permissions.ts`), then used it to close a real leak: unit cost, AVCO average cost, and stock value in `src/server/inventory/stock.ts` were returned unconditionally to anyone with `inventory:stock:read` — including the Warehouse role, whose own description says "No pricing, no invoices." Proven end-to-end by `tests/field-visibility.test.ts`.
- **Index + N+1 pass** — fixed a real N+1 (`recomputeOrder`/`recomputeInvoice` ran one `taxCategory.findUnique` per line on every single order/invoice mutation; now one JOIN) and two real missing indexes: `Membership.userId` (the RLS bootstrap policy filters on it alone, before any tenant context exists — this is the single most-executed query in the app, once per authenticated request) and `CreditNoteLine.invoiceLineId`.
- **User documentation** (`docs/user-guide/`) — a genuinely end-user-facing guide (getting started, settings, products & contacts, inventory, sales, invoicing), written and verified against the actual screens rather than the plan. Documents current real gaps honestly rather than describing unbuilt features — e.g. it says outright that inviting a teammate isn't built yet.

**Deferred, needs external accounts or a concrete job to run:**

- **Background jobs (pg-boss)** — no actual job exists yet in the product (no emails, no webhooks, nothing scheduled). Building the queue now would be speculative infrastructure with nothing to run; better to add it once Stripe webhooks or invitation emails give it a real job.
- **Onboarding flow** (inviting a teammate) — needs an email provider to actually send anything.
- **Stripe subscription billing** — needs a real Stripe account and API keys.
- **Error tracking** — needs a Sentry (or equivalent) account and DSN.
- **Backups** — likely just documenting Neon's built-in point-in-time recovery, not a new service, but not yet confirmed as sufficient.

---

### P6+ — Expansion, each confirmed before starting

CRM → Procurement → Accounting/GL → HR → Manufacturing → BI/reporting → public API + webhooks → mobile.

**Accounting/GL is the highest-value item here**, because it is what turns Glide from "operations software" into "the system of record" — and the domain-event seam built in P4 is what makes it additive rather than a rewrite.

---

## 4. Sequencing risks

| Risk | Where it bites | Mitigation |
|---|---|---|
| RLS silently not working | P0, discovered at P4 when a customer sees another tenant's invoice | The isolation test is a P0 gate, not a nice-to-have |
| On-hand cached as mutable state | P2, discovered at P4 when stock and valuation disagree | Rebuild-from-ledger test in P2 |
| Header status stored not derived | P3, discovered when partial deliveries drift | Derivation test in P3 |
| Tax rounding differences per country | P4, discovered by a customer's accountant | Golden-case suite in P1, before invoicing exists |
| Scope creep into CRM/HR before v1 ships | Any phase | Nothing before P5 without an explicit decision to reorder |

---

## 5. What is explicitly *not* in v1

Stated plainly so it isn't rediscovered as a surprise:

- Automatic US nexus-aware sales tax sourcing (architecture §4.2)
- Full 27-state EU VAT rate coverage at P1 (architecture §7)
- Double-entry general ledger
- Manufacturing / BoM
- Payroll (country-specific and heavy)
- No-code studio for custom fields — the JSONB seam ships in P0, the editor does not
- Kanban, pivot, calendar and gantt views — the query layer makes them cheap later
- Multi-language UI (English only, by decision; country drives numbers and tax, not language)
