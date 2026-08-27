# Stage 1 — Competitive & Design Research

**Status:** Draft for review
**Date:** 2026-08-24
**Scope:** Odoo and Zoho in depth; NetSuite and Microsoft Dynamics 365 briefly.
**Purpose:** Extract *structural and UX patterns* that make an ERP feel enterprise-grade, and decide what Glide adopts, adapts, or rejects. No visual design, branding, or copy is taken from any of these products.

---

## 1. The central finding: an ERP is a graph of documents, not a set of CRUD screens

Every mature ERP is built on the same spine — a chain of **immutable, numbered business documents** that reference each other and advance through states:

```
  Lead ─▶ Opportunity ─▶ Quotation ─▶ Sales Order ─┬─▶ Delivery ──▶ ┐
                                                    │                ├─▶ Invoice ─▶ Payment
                                                    └────────────────┘

  Requisition ─▶ Purchase Order ─▶ Receipt ─▶ Vendor Bill ─▶ Payment
```

The transition between any two links is never "edit a row." It is: **validate the source document → change its state → generate a downstream document that keeps a link back upstream → post the resulting stock and financial effects.**

This is the difference between an ERP and an admin panel, and it dictates the schema. Three consequences that must be designed in from day one, because retrofitting any of them is a rewrite:

### 1.1 Partial fulfilment is the normal case, not an edge case

Both Odoo and Zoho let a single sales order be delivered in several shipments and invoiced in several invoices, without losing track of the unfulfilled remainder. Zoho models this as Sales Order → one or more Packages → Shipments, with the order reaching `Confirmed` once an invoice, package, or shipment exists against it.

**Schema requirement:** every order/invoice **line** must carry, at minimum:

| Field | Meaning |
|---|---|
| `qty_ordered` | what the customer asked for |
| `qty_delivered` | rolled up from validated stock moves |
| `qty_invoiced` | rolled up from posted invoice lines |

Document-level status is *derived* from these line quantities, never stored as the source of truth. A header field like `status = 'delivered'` that isn't computable from its lines will be wrong within a month of real use.

### 1.2 Invoicing policy is a setting, not a hardcoded flow

Odoo exposes an explicit **invoicing policy** per product/order — *invoice what is ordered* (invoice immediately on confirmation, used for prepaid and services) versus *invoice what is delivered* (an invoice can only be drafted once a delivery is validated, standard for physical goods). It further supports invoicing the whole order, a percentage advance, a fixed advance, or a selected subset of lines.

**Requirement:** Glide's invoice-generation service takes quantities from a strategy object chosen by policy, not from a fixed `order.lines[].qty`. Advance/deposit invoicing must be representable from the start.

### 1.3 Stock effects belong to the delivery, financial effects to the invoice

Confirming an order reserves; validating a delivery moves stock; posting an invoice creates the receivable. Conflating these — the common shortcut in small systems — makes partial flows, returns, and month-end reconciliation impossible. This directly supports the master plan's decision that on-hand quantity is *derived from an immutable move ledger*.

---

## 2. Information architecture

### 2.1 How the four structure their module space

| Product | Structure | Consequence |
|---|---|---|
| **Odoo** | One application, ~40+ installable "apps" sharing a single database and object model (`res.partner` serves customer, supplier and contact). App switcher grid, then per-app top menu. | Genuinely unified data. A customer is one record everywhere. Cross-module flows are native. |
| **Zoho** | ~50 *separate products* (Books, Inventory, CRM, People…) bundled as Zoho One, each with its own DB, UI conventions, and sync layer. Zoho Inventory's own modules: Dashboard, Contacts, Items & Item Groups, Composite Items, Sales Orders, Packages, Invoices, Purchase Orders, Bills, Reports, Integrations, Settings. | Each app is individually cleaner and easier than Odoo, but cross-app flows require explicit sync/Flow automation, and the same customer exists several times. |
| **NetSuite** | Role-scoped **Centers** — each role sees a different set of tabbed pages, each page a dashboard of **portlets**. Navigation itself is permission-shaped. | Extremely tailored per job function; also why NetSuite feels different for every user and is hard to document. |
| **Dynamics 365** | Separate "apps" (Sales, Finance, Supply Chain) over a shared Dataverse, unified by the Power Platform. | Shared data layer like Odoo, separate app shells like Zoho — plus licensing complexity. |

**Verdict for Glide:** follow the **Odoo model** — one database, one object model, one app shell, modules as toggleable capabilities. Zoho's fragmentation is its single biggest structural weakness and is the thing customers complain about most. This confirms the modular-monolith decision in the master plan and makes the unified `Partner` entity (customer/supplier/contact in one table) a load-bearing choice rather than a convenience.

### 2.2 The navigation hierarchy that all four converge on

```
Tenant / Company switcher      ← which legal entity am I acting as
   └─ Module               (Sales)
        └─ Section         (Orders / Quotations / Customers)
             └─ List view  (filtered, grouped, saved)
                  └─ Record view
                       └─ Related documents (via smart buttons)
```

Four levels, never more. Anything deeper gets reached by *filtering* a list, not by adding another nav tier. This is why ERPs stay navigable at 200+ screens while admin panels collapse at 30.

---

## 3. UX patterns worth stealing (structurally)

### 3.1 One dataset, many renderings

Odoo renders the *same* model and the *same* active filter set as list, form, kanban, pivot, graph, calendar, gantt, map, or activity view — switchable from a control in the top-right, with the search/filter state preserved across the switch.

The architectural lesson matters more than the feature list: **the query/filter layer is a separate abstraction from the renderer.** If Glide builds filtering, sorting, grouping, and pagination as a shared query layer that any view component consumes, adding kanban and pivot later costs days instead of months. If we bolt filtering into the `DataTable` component, we pay for it forever.

> **This refines the master plan.** `DataTable` should be a *consumer* of a `useRecordQuery` / server-side `queryRecords()` layer, not the owner of query state.

### 3.2 The search view: filters, group-by, and favourites are three different things

Odoo's search bar is one of the most-copied patterns in enterprise software, and it decomposes into:

- **Search input** — typing offers field-scoped matches ("Acme" → *Customer contains Acme*, *Reference contains Acme*), rather than one opaque full-text box
- **Filters** — predefined named predicates (`My Orders`, `Late`, `This Quarter`), combinable, OR within a group and AND across groups
- **Group By** — dynamic grouping on *any* field, producing collapsible sections with per-group aggregates
- **Favourites** — the current search state saved with a name, shareable with other users, and settable as the user's default for that view

NetSuite's equivalent — **saved searches** — is widely described as the most valuable feature in the product; they become dashboard portlets, reports, and email alerts.

**This is the single clearest dividing line between "enterprise-grade" and "generic admin panel," and it is almost always deferred to v2 and never built.** Glide ships named filters + group-by + saved views in **P1**, in the core table component, for every module.

### 3.3 Smart buttons — making the document graph traversable

Odoo places a row of **smart buttons** in the record header showing counts of related documents: `1 Delivery`, `2 Invoices`, `₹0.00 Paid`. Each is both an indicator and a link.

This is how users actually navigate an ERP — not by going back to a list and searching, but by walking the document graph from wherever they are. It is cheap to build, and its absence is instantly noticeable. **Adopt directly.**

### 3.4 The status bar — always know where you are and what's next

Every Odoo document shows a horizontal state stepper in the top-right of the header (`Quotation → Quotation Sent → Sales Order`), with the **contextually valid action buttons to its left**. The buttons change as the state changes; invalid transitions simply aren't rendered.

Two rules follow:
- The state machine is defined **once**, server-side, and drives both the stepper and the available actions. The UI never hardcodes "show Confirm button."
- Reaching a state is a server-validated transition, not a dropdown that sets a field.

### 3.5 Chatter — audit and collaboration on the record itself

Odoo attaches a **chatter** to every business record: a message thread, `@`-mentions, scheduled activities with due dates and owners, followers, file attachments, and an automatic log of field changes ("Status changed from Draft to Confirmed by A. Hazari").

This solves audit trail, internal communication, and follow-up tasks with one component, and it's a major reason Odoo feels like a system of record rather than a database front-end. **Adopt** — the master plan's `AuditTrail` + `AttachmentList` + activity log should be unified into a single `Chatter` composite rather than three separate widgets.

### 3.6 Dashboards are composed from saved views, not hand-built

NetSuite's dashboards are assembled from portlets — KPI meters, saved-search result lists, report snapshots, reminders, shortcuts, trend graphs — that the user arranges, and which are scoped by role.

The lesson: **don't hand-build a bespoke dashboard page per module.** Build a small portlet registry where a KPI tile or list portlet is configured from a saved view. The dashboard then comes almost free once saved views exist, and users can personalise without engineering work.

### 3.7 Bulk operations at real scale

Enterprise lists routinely select hundreds of records and act on all of them — bulk status change, bulk export, bulk field edit, bulk delete, bulk print. Two details that are easy to get wrong:

- **"Select all matching this filter"** must be distinct from "select all 50 rows on this page." Users need to act on 3,400 matching records without paginating.
- Bulk actions run **server-side against the filter predicate**, not against a list of 3,400 ids sent from the browser.

### 3.8 Configuration without code

All four let administrators add custom fields, rename labels, reorder form fields, define numbering sequences, and build approval/automation rules — without a developer. Odoo Studio, Zoho's custom fields, NetSuite's custom records, Dynamics' Power Platform.

Full no-code configuration is far beyond v1, but two pieces are cheap now and expensive later:
- **Custom fields** — a JSONB `custom_fields` column plus a per-tenant field-definition table on every business entity from the first migration
- **Number sequences** — already in the master plan; correct, keep it

---

## 4. Permissions: four layers, not one

Odoo's security model is the most instructive of the four, and it operates at four distinct layers:

| Layer | Question it answers | Odoo mechanism |
|---|---|---|
| 1. **Groups** | Who is this user? | Security groups; a user in several groups gets the **union** of permissions — if any group grants write, they can write |
| 2. **Model access (ACL)** | May they do CRUD on this *entity*? | Per-model create/read/write/unlink flags per group |
| 3. **Record rules** | *Which rows* of that entity may they see? | Domain filters per group; a rule with no group attached is **global** and applies to everyone |
| 4. **Field-level** | May they see *this column*? | Fields restricted to groups, enforced server-side, not just hidden in the view |

A generic admin panel has exactly one layer: role → page. Enterprise buyers will ask about layers 3 and 4 during procurement — "the warehouse team must not see margins," "sales reps see only their own accounts."

> **This refines the master plan.** The plan's `module:resource:action` permission strings cover layer 2 well. Layers 3 and 4 need explicit design in Stage 3:
> - **Layer 3** — a record-scope predicate attached to a role (e.g. `owner_id = :userId`, `warehouse_id IN :userWarehouses`), composed into every query in the service layer alongside the RLS tenant predicate. Note that Postgres RLS gives us layer 3 machinery for free — we're already paying for it for tenancy, so extend it rather than adding a parallel mechanism.
> - **Layer 4** — a field-visibility map per role, applied in the serialiser so restricted fields never leave the server. Hiding a field only in the React component is not a permission.
>
> Also adopt the **union semantics**: multiple roles per member, permissions unioned, never intersected. Users will have more than one role.

---

## 5. What actually makes it feel "enterprise-grade"

Distilled into a checklist Glide must satisfy. This is the acceptance criteria for the design system in Stage 2.

1. **Documents, not rows.** Numbered, immutable once posted, corrected by reversal, never silently edited.
2. **The document graph is navigable in both directions** — smart buttons up and down the chain.
3. **Real search:** field-scoped input, named filters, group-by on any field, saved and shareable views.
4. **Ruthless consistency.** Every list view has the same anatomy; every record view has the same anatomy. A user who learns Sales can operate Procurement without instruction. *Consistency reads as competence.*
5. **Density.** Information per screen is a feature. A power user living in this eight hours a day wants 40 rows visible, not 12 with generous whitespace.
6. **Permission-shaped UI, server-enforced.** The same page looks different by role — and the difference is real, not cosmetic.
7. **Traceability.** Every number drills to its source documents. Every change records who, when, and from what to what.
8. **Bulk everything.** Any single-record action worth doing is worth doing to 500 records.
9. **Keyboard-operable.** Data entry staff should never need the mouse in a line-item grid.
10. **It never loses your work.** Drafts persist, navigation warns, concurrent edits are detected rather than silently overwritten.
11. **Multi-entity aware.** One tenant, several legal entities, a company switcher, and documents that belong to a company — confirmed by Odoo and NetSuite both, and validating the plan's Tenant → Company split.

---

## 6. Where the incumbents are weak — Glide's opening

| Product | Strength | Weakness we can attack |
|---|---|---|
| **Odoo** | Deepest unified object model; the document flows are genuinely right | Web client is heavy and slow; UI is dense to the point of intimidating; brutal learning curve; onboarding takes a partner and a budget |
| **Zoho** | Individually clean, cheap, fast to start | Fragmented across ~50 apps with inconsistent UX; cross-app data flow needs explicit sync; the same customer exists in five places |
| **NetSuite** | Unmatched depth, saved searches, role-based centers | Interface feels a decade behind; any customisation needs SuiteScript and a consultant; expensive |
| **Dynamics 365** | Enterprise credibility, Microsoft ecosystem | Complex licensing; heavy Power Platform dependency; needs a partner to implement |

**Common to all four: nobody has made an ERP feel *fast*.** None are keyboard-first. None have a command palette. All four have onboarding measured in weeks-with-a-consultant. That is the gap.

### Glide's design thesis

> **The document rigor of Odoo, the visual clarity of Zoho, and the speed and keyboard-first feel of a modern product like Linear — in one coherent application.**

We are not competing on module count in year one; we lose that comparison to all four. We compete on *the quality of the modules we have* and on time-to-first-invoice. A business should get from signup to a correctly-taxed invoice in under fifteen minutes, unassisted — something none of the four can claim.

---

## 7. Adopt / Adapt / Reject

| Pattern | Decision | Note |
|---|---|---|
| Unified object model, one DB, modules as capabilities | **Adopt** (Odoo) | Zoho's fragmentation is the thing to avoid |
| Single `Partner` for customer/supplier/contact | **Adopt** (Odoo `res.partner`) | Already in the master plan; research confirms it |
| Document chain with per-line ordered/delivered/invoiced quantities | **Adopt** | Non-negotiable schema requirement |
| Configurable invoicing policy (ordered vs delivered) + advance invoicing | **Adopt** | Must exist in P4's first migration |
| Smart buttons for related-document navigation | **Adopt** | Cheap, high impact |
| Server-defined state machine driving both stepper and available actions | **Adopt** | Add `StateMachine` to the Stage 2 component list |
| Chatter (messages + activities + field-change log + attachments) | **Adopt, unified** | Merge the plan's three separate widgets into one composite |
| Filters / Group By / saved & shareable views | **Adopt, ship in P1** | The clearest enterprise signal; never defer |
| Query layer separated from view renderer | **Adopt** | Refines the master plan's `DataTable` design |
| Four-layer permission model | **Adopt** | Extends the plan's RBAC; layer 3 rides on the RLS we're already building |
| Custom fields via JSONB + field-definition table | **Adopt the seam, defer the UI** | Column exists from migration one; the editor comes much later |
| Dashboard portlets composed from saved views | **Adapt** (NetSuite) | Portlet registry, not bespoke dashboard pages |
| "Select all matching filter" + server-side bulk actions | **Adopt** | Correctness issue, not a nicety |
| Multiple view types (kanban, pivot, calendar, gantt) | **Adapt** — list + record in v1, kanban and pivot once the query layer exists | Don't build nine renderers |
| Role-based *navigation* (NetSuite Centers) | **Adapt** | Hide modules a role can't access; don't build fully role-variant nav trees |
| Full no-code studio (Odoo Studio / Power Platform) | **Reject for v1** | Enormous surface; revisit post-launch |
| Odoo's visual density and information hierarchy | **Reject** | Adopt the density, reject the cramped, undifferentiated presentation |
| App-switcher grid as primary navigation | **Reject** | Persistent sidebar is faster and keeps context |

---

## 8. Open questions carried into Stage 2 and Stage 3

1. **Chatter scope in v1** — full message threads with `@`-mentions and scheduled activities, or field-change audit log only, with messaging deferred? Messaging is a meaningful build. *Recommendation: audit log + attachments in P0, comments in P1, scheduled activities with CRM in P6.*
2. **Custom fields** — confirm the JSONB column ships in the first migration on all business entities, even though nothing reads it until much later.
3. **Field-level permissions (layer 4)** — needed at v1 launch, or is entity-level plus record-scope enough for the first customers? Affects how much serialiser machinery P0 needs.
4. **View types beyond list** — is kanban required for a sellable v1 (it's the expected UI for pipelines and fulfilment boards), or does list-only ship?

---

## Sources

- [Odoo 19 — Sales documentation](https://www.odoo.com/documentation/19.0/applications/sales/sales.html)
- [Odoo 19 — Invoicing policies](https://www.odoo.com/documentation/19.0/applications/sales/sales/invoicing/invoicing_policy.html)
- [Odoo 19 — Invoicing processes](https://www.odoo.com/documentation/19.0/applications/finance/accounting/customer_invoices/overview.html)
- [Odoo 19 — Order handling](https://www.odoo.com/documentation/19.0/applications/websites/ecommerce/order_handling.html)
- [Odoo 19 — View architectures (developer reference)](https://www.odoo.com/documentation/19.0/developer/reference/user_interface/view_architectures.html)
- [Odoo 19 — Views (Studio)](https://www.odoo.com/documentation/19.0/applications/studio/views.html)
- [Odoo security: access rights, record rules, field-level security](https://medium.com/@niralchaudhary9/odoo-security-complete-guide-to-access-rights-record-rules-field-level-security-e0e3c878f08f)
- [Users, groups, access rights and record rules in Odoo](https://www.serpentcs.com/blog/odoo-module-487/users-groups-access-rights-and-record-rules-in-odoo-230)
- [Zoho Inventory — Modules overview](https://www.zoho.com/us/inventory/kb/general-overview/zom-modules.html)
- [Zoho Inventory — Sales transactions overview](https://www.zoho.com/us/inventory/help/sales-orders/sales-orders-overview.html)
- [Zoho Inventory — Managing sales orders](https://www.zoho.com/us/inventory/help/sales-orders/sales-order-managing.html)
- [Zoho Inventory — Order fulfillment system](https://www.zoho.com/us/inventory/order-fulfillment-system/)
- [NetSuite — Centers overview (Oracle docs)](https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/chapter_N131898.html)
- [NetSuite dashboards guide](https://nuagecg.com/blog/netsuite-dashboards/)
- [NetSuite role-based dashboards — best practices](https://www.kimberlitepartners.com/blog/netsuite-role-based-dashboards)
- [Dynamics 365 vs NetSuite comparison](https://www.erpresearch.com/blog/en-us/blog/dynamics-vs-netsuite)
