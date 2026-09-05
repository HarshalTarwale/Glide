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
- **User documentation** (`docs/user-guide/`) — a genuinely end-user-facing guide (getting started, settings, products & contacts, inventory, sales, invoicing), written and verified against the actual screens rather than the plan.
- **Backups** (`docs/operations.md`) — two layers: Neon's own point-in-time recovery as the primary, automatic mechanism (documented: how to verify retention, how to restore via a time-travel branch, and to actually practice a restore once), plus `scripts/backup-db.mjs` (`npm run db:backup`) as a portable `pg_dump` export for the failure mode PITR doesn't cover — losing the Neon project itself. The script's failure path is verified (missing `pg_dump` fails with a clear message); the dump-and-restore round trip has not been run end-to-end in this environment, since the Postgres client tools aren't installed here — noted honestly in the doc rather than claimed as tested.
- **Onboarding flow — team invitations** — the real invite/accept/manage mechanism (`src/server/core/invitations.ts`, `members.ts`), not stubbed: an Owner/Administrator invites an email + role(s) from **Settings → Members**, gets a token-bearing link (7-day, single-use, re-invite issues a fresh one), and whoever opens it either creates an account (mirrors `signup.ts`'s own user creation) or, if a Glide account already exists for that email, accepts once signed in as it — with a server-side session/email check on that path specifically, since there's no password to verify there otherwise. Members can have their roles changed or be removed afterward from the same screen; the organisation Owner can't be. Only email *delivery* is deferred — the inviter copies the link and sends it however they currently reach that person.

  Required a new RLS bootstrap path, the same shape as `app_current_user()` for `Membership`: `app_current_invite_token()` and a policy clause on `invitation` admitting exactly the one row a valid token names (migration `00000000000011`). Caught by the acceptance test in the same pass: `tenant`'s own policy needed the identical clause (migration `00000000000012`) — `getInvitationPreview`'s `include: { tenant: true }` was silently coming back `null`, because being able to see the `invitation` row doesn't, on its own, make the `tenant` row it points at visible under that table's *own* RLS policy. Two tables, one bootstrap concept, both needed the clause.

**Deferred, needs external accounts or a concrete job to run:**

- **Background jobs (pg-boss)** — no actual job exists yet in the product (no emails, no webhooks, nothing scheduled). Building the queue now would be speculative infrastructure with nothing to run; better to add it once Stripe webhooks or a real email provider gives it one.
- **Stripe subscription billing** — needs a real Stripe account and API keys.
- **Error tracking** — needs a Sentry (or equivalent) account and DSN.
- **Sending invitation emails automatically** — needs an email provider (Resend, Postmark, etc.); the mechanism above is ready for it, this is only the delivery step.

---

### P6+ — Expansion, each confirmed before starting

CRM → Procurement → Accounting/GL → HR → Manufacturing → BI/reporting → public API + webhooks → mobile.

**Accounting/GL is the highest-value item here**, because it is what turns Glide from "operations software" into "the system of record" — and the domain-event seam built in P4 is what makes it additive rather than a rewrite.

#### Accounting / GL — **built, confirmed with the user 2026-09-04**

Delivered exactly on that premise: `src/server/accounting/gl-subscriber.ts` is the first real subscriber to P4's domain event bus, and `invoicing.ts`, `payments.ts` and `credit-notes.ts` were not touched to add it — the whole point of building that seam three phases early.

- **Chart of accounts** (`LedgerAccount` — named that, not `Account`, because core.prisma's Auth.js integration already owns that name) — eight default accounts seeded automatically for every new tenant (`accounting-bootstrap.ts`, wired into `bootstrap-tenant.ts`) and backfilled for the two tenants that pre-dated this module (`scripts/backfill-accounting.mjs --apply`, idempotent). A tenant adds more; the eight "system" accounts (looked up by `systemKey`, never by id) have their type locked and can't be deactivated, since the auto-posting logic depends on them existing.
- **Journal entries** — manual (`createJournalEntry` → draft → `postJournalEntry`) or automatic (posted already-final, mirroring Delivery/CreditNote's own "created already done" shape). THE invariant — debits equal credits — lives in one pure function (`src/lib/accounting/journal.ts`'s `isBalanced`), checked before every post, never in a DB trigger, so the same check runs live in the UI while drafting. Posted entries are immutable; idempotency for the auto-posted path is a real DB constraint (`(tenantId, sourceType, sourceId)` unique on `JournalEntry`), not just an in-memory check.
- **Auto-posting**: `invoice.posted` → Dr Accounts Receivable / Cr Sales Revenue (+ Tax Payable). `payment.recorded` → Dr Cash / Cr Accounts Receivable. `creditnote.issued` → the exact reversal of the invoice posting for the credited amount. Registered once per server instance via `src/instrumentation.ts` (Next's documented, stable-since-v15 hook) — confirmed firing for real (not just compiling) by running an actual `next dev` server and grepping its startup log for `gl-subscriber`'s own registration line, closing the one gap this section originally flagged as untested.
- **Reports**: Trial Balance, Income Statement, Balance Sheet (`/app/reports`, repurposing the `soon: true` nav placeholder that was already waiting for this), all built on the same pure functions the golden tests exercise directly — a report can never disagree with what the ledger actually enforced.

**Scope deliberately NOT built, stated the same way the tax engine's and P2's own scope notes are** (v2, not oversights): stock movements don't emit domain events yet, so COGS/inventory postings aren't automatic (the Inventory Asset and COGS accounts exist in the default chart, waiting); no AP/Procurement postings (that module doesn't exist); no formal period-close (the Balance Sheet computes current-period net income on the fly); no multi-currency GL consolidation.

Verified against live Neon: `tests/journal.test.ts` (20/20 pure-function golden cases), `tests/accounting.test.ts` (5/5 — chart-of-accounts seeding, balance enforcement, immutability, all three auto-postings with correct amounts on the correct accounts, and all three reports reconciling against real posted activity). Full suite 187/190 (3 skipped, unchanged), tsc clean, eslint clean, `next build` clean.

#### CRM — **built, confirmed with the user 2026-09-04**

The next module in the roadmap's own stated P6+ order (Accounting/GL was pulled forward by explicit choice; CRM is first among what remained).

- **Lead → Opportunity → Activity**, reusing `Partner` (partners.prisma) rather than a separate "CRM contact" model — the same one-model-many-roles decision that file's own header comment already made for customer/supplier/contact. A Lead becomes a real Partner (marked a customer) on conversion, optionally with an Opportunity opened against it in the same step.
- **Conversion is one transaction, not a call into `createPartner()`**: that function opens its own `withTenant()` transaction, and nesting one interactive transaction inside another would let the Partner commit on its own connection even if the surrounding conversion later failed — an orphaned Partner with no Lead pointing at it. `convertLead()` creates the Partner (and Opportunity) directly inside its own single transaction instead, proven atomic by a live test asserting the lead can never be converted twice.
- **Pipeline** — a genuine Kanban board (`/app/crm/pipeline`), the signature CRM screen per the Stage 1 Odoo/Zoho teardown, grouped by a fixed `OpportunityStage` enum (not a tenant-configurable pipeline — a stated v2 boundary, same reasoning as every other module's scope notes). Moving a card resets its probability to the new stage's default (`DEFAULT_PROBABILITY_BY_STAGE`) unless it's a no-op move. Deliberately NOT native HTML5 drag-and-drop: a per-card stage `<select>` delivers the same outcome without an interaction that's genuinely hard to verify correct without a browser in this environment — a defensible, honest scope choice, not a shortcut taken silently.
- **The pipeline forecast math is a pure function** (`src/lib/crm/pipeline.ts`'s `summarizePipeline`) — weighted value (each open deal's expected value × its probability, so one huge low-probability deal can't dominate the number a sales manager actually trusts), win rate reported as `null` (not `0`) until something has actually closed, so "no data yet" is never confused with "you're losing everything."
- **Marking an opportunity lost requires a reason** (`requiresLostReason`), the same discipline `CreditNote.reason` already enforces for invoicing — a closed-lost deal that can't say why is a report nobody trusts.
- **Activities** — a shared follow-up log (call/email/meeting/to-do, due date, done/not-done) embedded on both the Lead and Opportunity record pages, linked to exactly one of a Lead, an Opportunity, or a Partner. Deliberately not a scheduler: no invites, no recurrence, no inbox sync.

Verified against live Neon: `tests/pipeline.test.ts` (12/12 pure-function golden cases), `tests/crm.test.ts` (7/7 — atomic lead conversion including the double-conversion guard, a converted lead's status becoming immutable, stage-change probability resets, the lost-reason requirement, the pipeline summary matching what the pure function computes from the same real rows, activity logging/completion, and tenant isolation). Full suite 206/209 (3 skipped, unchanged), tsc clean, eslint clean, `next build` clean.

#### Procurement — **built, confirmed with the user 2026-09-05**

The buy-side mirror of Sales (P3) + Invoicing (P4), closing the gap the Accounting/GL section above named explicitly as not yet built: "no AP/Procurement postings (that module doesn't exist)." It does now, and `gl-subscriber.ts` gained two more handlers for it — still the same single subscriber module, not a second one, so architecture.md §7.1's revisit trigger still hasn't fired.

- **`PurchaseOrder` → `PurchaseOrderLine` → `Receipt`/`ReceiptLine` → `Bill`/`BillLine` → `BillPayment`/`BillPaymentAllocation`**, each step mirroring its Sales/Invoicing counterpart line-for-line: order status derived from qty ordered/received/billed exactly like `SalesOrder.status`; a receipt is created already `done` and calls `recordMove()` directly (`type: "receipt"`, from the `SUPPLIERS` external location into the warehouse), exactly like `Delivery` does in reverse; a bill is immutable once posted with a frozen `taxBreakdown`, exactly like `Invoice`.
- **Seller and buyer are deliberately reversed from Invoicing**: on a Bill, the supplier (a `Partner`) is the seller of record for tax purposes and Glide's own `Company` is the buyer — the mirror image of an Invoice, not a copy of it. `resolveSellerParty`/`resolveBuyerParty` in `bills.ts` say so explicitly rather than leaving it to be inferred from field names.
- **`BillPayment`/`BillPaymentAllocation` are their own models**, not a reuse of `Payment`/`PaymentAllocation` — a deliberate choice to avoid regression risk on P4's already-shipped, already-tested AR payment code, at the cost of some duplication. `BillingPolicy` (`bill_ordered`/`bill_received`) mirrors `InvoicingPolicy` exactly.
- **Auto-posting**: `bill.posted` → Dr Cost of Goods Sold (+ Tax Payable, netted down rather than booked to a separate Input Tax Credit asset — a stated v1 simplification) / Cr Accounts Payable. `billpayment.recorded` → Dr Accounts Payable / Cr Cash. Idempotent via the same `(tenantId, sourceType, sourceId)` unique constraint the Accounting section already established.
- **AP Aging** (`src/server/procurement/ap-aging.ts`, `/app/procurement/aging`) is the exact mirror of `ar-aging.ts`'s bucketing, applied to what Glide owes instead of what it's owed.

**Scope deliberately NOT built, same discipline as every prior module's own notes**: no debit note (the AP equivalent of a CreditNote) — a bill can only be cancelled while still a draft; bill lines always post to Cost of Goods Sold, never capitalized to the Inventory Asset account (proper perpetual-inventory GL integration is blocked on the same P2-stock-moves-don't-emit-events gap the Accounting section already flagged); tax paid to a supplier clears through the same Tax Payable account rather than a separate Input Tax Credit asset.

Verified against live Neon: `tests/procurement-order-status.test.ts` + `tests/bill-status.test.ts` (27/27 pure-function golden cases), `tests/procurement.test.ts` (6/6 — full order → receipt → bill → payment lifecycle, GL auto-posting on both `bill.posted` and `billpayment.recorded` verified against real ledger rows, post-then-edit immutability guards, AP aging against real outstanding bills, and tenant isolation). Full suite 239/242 (3 skipped, unchanged), tsc clean, eslint clean, `next build` clean.

#### HR — **built, confirmed with the user 2026-09-05**

Next in the roadmap's own stated order after Accounting/GL, CRM, and Procurement. Scoped deliberately smaller than a full HR suite: an employee directory plus leave tracking, not payroll or attendance — see hr.prisma's own header comment for the explicit boundary.

- **`Department` (flat, no hierarchy) → `Employee` (self-relation for `reportsTo`) → `LeaveType` (tenant-configured, annual allocation) → `LeaveRequest`** (pending/approved/rejected/cancelled). Employee is deliberately NOT linked to a User/login — no self-service portal in this version. HR Manager (or Owner/Administrator) manages leave on an employee's behalf, the same way Accountant manages bills on a supplier's behalf in Procurement.
- **Leave balance is derived, never a stored counter**: `src/lib/hr/leave.ts`'s `computeLeaveBalance` subtracts a year's approved `LeaveRequest.days` from `LeaveType.defaultAnnualDays` at read time — the same discipline stock-on-hand (P2) and invoice/order status (P3/P4) established, applied to a new domain. `computeLeaveDays` (business days, weekends excluded) runs once at request creation and is frozen on the row from then on, so a future change to what counts as a business day can never reshape an already-decided request.
- **A leave request cannot overlap another pending or approved request for the same employee** (`rangesOverlap`, checked inside the creating transaction) — the same "catch it before it's a data problem" instinct as the order/invoice quantity guards elsewhere.
- **A decision is final**: `approveLeaveRequest`/`rejectLeaveRequest` both refuse to act on a request that isn't still `pending`, and only a `pending` request can be cancelled — the correction for a bad decision is a new request, not an edit to the old one, the same posted-document philosophy every other module uses even though a leave request isn't a fiscal document.

**Scope deliberately NOT built, same discipline as every prior module's own notes**: no payroll processing — `Employee.baseSalary` is reference data, nothing computes a payslip from it; no time & attendance (clock-in/out); no employee self-service portal; no recruitment/ATS or performance reviews.

Verified against live Neon: `tests/leave.test.ts` (11/11 pure-function golden cases for day-counting, balance math, and overlap detection), `tests/hr.test.ts` (6/6 — employee onboarding into a department with the department's employee count kept in sync, the self-report guard, a leave request's frozen day count and derived balance matching the pure function exactly, the overlap guard, the decision-is-final guard on both approve and cancel, and tenant isolation). Full suite 256/259 (3 skipped, unchanged), tsc clean, eslint clean, `next build` clean.

#### Manufacturing — **built, confirmed with the user 2026-09-05**

Next after HR. The one module here that reaches back into P2 rather than only forward from it: a completed work order writes real `StockMove` rows through the exact same `recordMove()` primitive Sales, Procurement and Inventory itself already use — proof that P2's "location kind drives behaviour, not move type" design (docs/architecture.md §5.6) genuinely generalises, since adding a whole new domain onto it took one new `LocationKind` value (`production`) and two new `StockMoveType` labels (`consumption`, `production`), with zero changes to `recordMove`, `applyValuationEvent`, or `StockQuant`'s upsert logic.

- **`BillOfMaterial` (batch quantity + components) → `WorkOrder` (draft → confirmed → done/cancelled) → `WorkOrderLine`** (component requirements, scaled from the BOM's batch ratio and frozen the moment a work order is created — `src/lib/manufacturing/bom.ts`'s `scaleBomLines`, a pure function with its own golden-case tests, the same "compute once, freeze" discipline invoice tax lines use).
- **Completion is the only place stock actually moves**, and it does the whole thing atomically: consume every component (valued at whatever AVCO currently says, same as any other consuming move), then produce the finished good — with its unit cost computed as the sum of what those components ACTUALLY cost when consumed, divided by quantity produced (`computeProducedUnitCost`). This is actual costing, not a configured standard cost: two batches of the same product can come out costed differently if component costs moved between them, which is correct, not a bug.
- **A new "PRODUCTION" virtual location**, alongside the existing SUPPLIERS/CUSTOMERS/ADJUST, added to `bootstrap-tenant.ts` for new tenants and backfilled onto the two pre-existing ones via `scripts/backfill-manufacturing.mjs` (same idempotent pattern as the Accounting backfill).
- **Guards enforced at the service layer, not left to the database to catch late**: a product can't be a component of its own BOM; both the BOM's output and every component must be untracked (no lot/serial) products, since manufacturing with tracked materials is a stated v2 feature; only a draft work order can be edited or confirmed; only a confirmed one can be completed; a deactivated BOM blocks new work orders without touching ones that already exist against it.

**Scope deliberately NOT built, same discipline as every prior module's own notes**: no routing/work centres/labour or machine time; no automatic multi-level BOM explosion (a sub-assembly gets its own work order, run first); no partial completion (a work order completes in full, for its whole planned quantity, in one step); no reservation of components at confirmation — availability is checked only at completion, the moment stock actually moves, the same cut P3's sales orders already make.

Verified against live Neon: `tests/bom.test.ts` (9/9 pure-function golden cases for BOM scaling and produced-cost math), `tests/manufacturing.test.ts` (5/5 — a full draft → confirm → complete cycle with the produced unit cost checked against hand-computed actual component cost, stock levels reconciling on both the consuming and producing sides, the "can't complete before confirmed" and "can't complete twice" guards, cancellation leaving stock untouched, the self-component and tracked-component BOM guards, a deactivated BOM blocking new work orders, and tenant isolation). Full suite 270/273 (3 skipped, unchanged), tsc clean, eslint clean, `next build` clean.

#### BI / Reporting — **built, confirmed with the user 2026-09-05**

Next after Manufacturing. Found and fixed a real bug on the way in: `/app` (the Overview page every signed-in user lands on) had been running on Stage 2's mock data (`src/lib/mock/sales-orders.ts`) the entire time since — every KPI tile, every "recent order," even the sidebar's "Coming in P2"/"Coming in P4" quick-link hints, all fabricated, never wired to any of the real modules built since. Nobody had gone back to fix it because no phase's own acceptance gate happened to look at the homepage. It's real data now.

- **`src/server/reporting/dashboard.ts` powers the Overview page and is deliberately unlike every other `server/` file**: it never calls `assertPermission` and never throws. The Overview page is shown to literally every signed-in user regardless of role, so each section (open sales orders, AR/AP outstanding, pipeline value, low-stock count, ...) is included only if `ctx.permissions` already covers it and silently omitted otherwise -- a Warehouse worker and an Accountant land on the same URL and see different, both fully real, dashboards.
- **`src/server/reporting/insights.ts` powers a new Business Insights page** (`/app/insights`) with the deeper cross-module analytics the roadmap named as still missing beyond the three financial statements: a 6-month revenue trend, top 5 customers and top 5 products (trailing 12 months), AR/AP totals, the CRM pipeline's weighted value, and every low-stock item. Gated behind one new permission (`reporting:insights:read`), granted only to Owner/Administrator (who already hold every permission it touches via `ALL_PERMISSIONS`) and Viewer (via the existing "every `:read` permission" rule) -- a deliberate v1 scope line, not an oversight: this page spans modules a single functional role (Sales Manager, Accountant) has no everyday need to see all of at once.
- **Reuses every module's own already-built, already-tested reports rather than recomputing them**: AR/AP totals come from `getArAgingReport`/`getApAgingReport`, pipeline value from `getPipeline`, low stock from `getStockLevels` -- Business Insights can never disagree with the dedicated report it's summarizing. The one new query surface is the revenue-by-month/top-customer/top-product aggregation, three raw SQL queries against posted invoices since no existing report computed them.
- **No chart library added.** Consistent with the design system's existing table/KPI-tile visual language, the revenue trend renders as a plain CSS width-percentage bar per month -- introducing a charting dependency for one bar chart was judged not worth it.

Verified against live Neon: `tests/reporting.test.ts` (4/4 -- real rows created across Sales, Invoicing, Procurement, CRM and Inventory all show up correctly in both the dashboard and Insights with GST correctly applied, a restricted-permission caller gets a partial dashboard rather than an error, Insights refuses a caller without `reporting:insights:read`, and tenant isolation). Full suite 274/277 (3 skipped, unchanged), tsc clean, eslint clean, `next build` clean.

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
