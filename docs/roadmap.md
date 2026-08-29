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

### P1 — Master data  ·  *schema, tax engine and query layer delivered*

**Delivered:** Prisma schema for Partner / Product / Category / UoM / TaxRate /
TaxCategory / PriceList / Warehouse / Location (30 tables total, RLS regenerated
across all 21 tenant-scoped tables). The five-regime tax engine with 32 golden
cases. Server-side `RecordQuery` compilation with 14 tests. Product service
(DAL) with permission layer 4 in the serializer. Products list as a true Server
Component.

**Still open in P1:** CSV import, saved-view persistence, chatter comments,
partner and warehouse UI, product create/edit forms.

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

### P2 — Inventory

**Scope:** the `StockMove` ledger, derived `StockQuant`, receipts, deliveries, internal transfers, adjustments, Lot/Serial tracking (per-product flag), AVCO valuation via `StockValuationLayer`, reorder rules, stock-on-hand and valuation reports.

**Done when:** a receipt raises on-hand, a delivery lowers it, an adjustment reconciles, valuation matches a hand-computed AVCO figure, and every one of those numbers is *derived from the move ledger* rather than read from a counter — verified by a test that rebuilds on-hand from moves and asserts it equals the cached quant.

**Key risk:** the temptation to cache on-hand as a mutable column "just for now." Architecture §5.6 names this as one of the two decisions most likely to be quietly violated under deadline pressure.

---

### P3 — Sales

**Scope:** Quotation → SalesOrder → SalesOrderLine → Delivery. Server-defined state machine. Stock reservation on confirmation. Delivery generation from the order. Per-line `qty_ordered` / `qty_delivered` / `qty_invoiced`. Invoicing policy field. Discounts and price lists. The editable `LineItemsEditor` with keyboard row navigation (Stage 2 shipped the read-only table).

**Done when:** quote → order → delivery visibly reduces on-hand in Inventory, a partial delivery leaves the order in `partially_delivered` with the remainder still tracked, and the header status is provably derived from line quantities rather than stored.

The Stage 2 mock data was deliberately built with partial-fulfilment states so the UI is already proven against this shape.

---

### P4 — Invoicing

**Scope:** invoices from a sales order or standalone, country-correct tax via the P1 engine, posting + immutability, PDF via `@react-pdf/renderer`, credit notes, payments, `PaymentAllocation` (many-to-many), AR aging report, and the **domain event on posting** that a future GL module will subscribe to.

**Done when:** order → invoice → PDF → payment → AR aging reconciles, a posted invoice cannot be edited, a correction produces a credit note, and one payment can settle parts of three invoices.

**This is the end of v1.** P0–P4 is the sellable product: a business can define products and customers, track stock, sell it, and get paid — with correct tax in five jurisdictions.

---

### P5 — Hardening & launch

**Scope:** Stripe subscription billing *for Glide itself*, onboarding flow, audit-log UI, index + N+1 pass, background jobs (pg-boss), error tracking, backups, field-level permissions (layer 4), user documentation.

**Done when:** someone who is not us can sign up, pay, and use it unassisted.

The distinction from P4 matters: P4 makes the product work. P5 makes it a business.

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
