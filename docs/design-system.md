# Stage 2 — Glide Design System

**Status:** Built and running. Draft for review.
**Date:** 2026-08-25
**Code:** `src/app/globals.css` (tokens) · `src/components/ui/` (primitives) · `src/components/erp/` (composites) · `src/components/layout/` (shell)

This document and the code are one deliverable. Nothing here is aspirational — every token and component described below exists, type-checks, and renders.

---

## 1. Principles

Five rules that decide every judgement call in this system.

1. **Documents deserve dignity.** This is a system of record. Screens should feel closer to a well-set financial statement than to a dashboard template.
2. **Hairlines, not shadows.** Structure comes from 1px rules and background shifts. Exactly one shadow token exists, and only floating layers (popover, dialog, palette) may use it.
3. **Density is a feature.** A user living here eight hours a day wants 40 rows on screen, not 12. Comfortable and compact are both first-class, user-toggled.
4. **The accent is rationed.** Primary actions are ink black. Violet is reserved for links, focus, active nav and selection. When everything is highlighted, nothing is.
5. **Consistency reads as competence.** Every list view has one anatomy; every record view has one anatomy. Learning Sales must teach you Procurement.

---

## 2. Brand foundation

The Glide logo is a **high-contrast editorial serif wordmark with a four-point sparkle**, in pure black. The entire visual system derives from it: black ink on warm paper, restrained everything else. The logo carries the serif; the interface does not compete with it.

**Assets (resolved).** The source PNG in `public/Logo/` is 10596x4080 and 370 KB with a space in its filename — not shippable. It is a pure-black wordmark on a genuinely transparent ground (verified: alpha 0 at the corners), which is what makes the dark-mode treatment simple.

Generated with `sharp` into `public/brand/`:

| Asset | Size | Use |
|---|---|---|
| `glide-wordmark.png` | 720x241, **15 KB** | Expanded sidebar, auth screens |
| `src/app/icon.png` | 512x512, 10 KB | Favicon / app icon |
| `src/app/apple-icon.png` | 180x180, 3 KB | iOS home screen |

**Dark mode** applies `dark:invert` to the wordmark. Because the art is pure black with transparency, inversion produces a clean white wordmark and leaves the background untouched — one asset, both themes, nothing to keep in sync.

**The sparkle is drawn as a vector**, not cropped from the PNG. A four-point star has empty bounding-box corners, and in the source artwork the "e" sits inside the sparkle's box, so no rectangular crop can isolate it. The vector is used for the collapsed sidebar rail and the app icon (white sparkle on an ink rounded square, which reads at 16px on any tab colour).

The 4.2 MB JPEG is unused and should be deleted from the repo.

---

## 3. Typography

Two faces, no serif. The first pass paired a display serif with Geist; the serif read thin and mismatched against dense data, so it is gone.

| Role | Face | Used for |
|---|---|---|
| **UI / data / display** | **Inter** | Everything |
| **Mono** | **JetBrains Mono** | Document numbers, SKUs, tax IDs, codes |

**Why Inter:** it is the best-engineered face available for 13–14px dense data, and it ships a proper tabular-figure set — which matters more than personality in a system that is mostly money columns.

**Why JetBrains Mono:** slashed zero and unambiguous `1`/`l`/`I`. When someone reads an invoice number aloud over the phone, that is worth more than character.

**Display sizes are the same family, set heavier and tighter** — weight 600 at `-0.028em` tracking, via the `.font-display` utility. Using one family at two treatments reads as deliberate typesetting; a second family competes with the logo, which is itself a display serif. Body text carries a slight `-0.006em` to keep dense tables crisp.

### Scale

Deliberately denser than stock Tailwind: **`text-base` is 14px, not 16px.** This is a data application, not a marketing site.

| Token | Size | Use |
|---|---|---|
| `text-2xs` | 11px | Badges, table meta, rail headings, keyboard hints |
| `text-xs` | 12px | Field labels, captions, toolbar text |
| `text-sm` | 13px | Table cells, dense UI |
| `text-base` | 14px | Body default |
| `text-lg` | 16px | Section headings |
| `text-xl` | 18px | Card titles |
| `text-2xl` | 22px | Sub-page titles, empty-state headings (display) |
| `text-3xl` | 28px | Page titles (display) |
| `text-4xl` | 36px | KPI figures (display) |

### Numerals

Every table, number input, and anything carrying the `.tnum` class uses **tabular figures** (`font-variant-numeric: tabular-nums`). Money and quantity columns are right-aligned so decimal points stack. This is not cosmetic — a misaligned ledger column is a usability defect.

---

## 4. Colour

Semantic tokens only. **No component may reference a raw hex value or a Tailwind palette colour** (`bg-slate-100` is a bug). Rebranding is editing `:root` in `globals.css`.

### Light

| Token | Value | Role |
|---|---|---|
| `canvas` | `#FAFAF8` | Page background — warm paper, never pure white |
| `surface` | `#FFFFFF` | Cards, panels, table body |
| `surface-sunken` | `#F4F3EF` | Table headers, inset areas, hover fills |
| `ink` | `#0A0A0A` | Primary text; matches the logo black |
| `ink-muted` | `#6B6B66` | Labels, secondary text |
| `ink-subtle` | `#9B9A93` | Placeholders, meta, disabled |
| `ink-inverse` | `#FAFAF8` | Text on ink-filled surfaces |
| `hairline` | `#E6E4DF` | The default 1px border |
| `hairline-strong` | `#D4D1CA` | Input borders, emphasised dividers |
| `accent` | `#4F3BD9` | **Glide Violet** — links, focus, active nav, selection |
| `accent-soft` | `#EEEBFC` | Selected rows, filter chips |

### Dark

Not an inversion — a separate, deliberately warm-neutral set. Canvas `#0B0B0C`, surface `#141416`, ink `#F5F4F1`, hairline `#26262A`, accent lightened to `#8B7BFF` for contrast against dark ground.

Because primary buttons are `bg-ink text-ink-inverse`, they become **white buttons with dark text in dark mode automatically** — the inversion is correct with no extra rules.

### Semantic

`success` green · `warning` amber · `danger` red · `info` blue. Each ships with a `-soft` tinted background for badges and banners.

**Why violet for the accent:** the four semantic colours occupy green, amber, red and blue. An indigo or blue accent would collide with `info`; amber with `warning`. Violet is the only hue left that stays legible and never gets confused with a document state. Swap it at `--accent` in one place if you want a different brand colour.

---

## 5. Density

Set `data-density` on `<html>`; every control reads the resulting variables.

| Token | Comfortable | Compact |
|---|---|---|
| `--row-h` | 40px | 32px |
| `--control-h` | 36px | 30px |

Use `h-row` on table rows and `h-control` on inputs and buttons. Never hardcode a height. The toggle lives in the top bar; in P0 it persists to user preferences.

---

## 6. Space, radius, elevation

- **Spacing**: Tailwind's 4px base scale, unmodified.
- **Radius**: `sm` 4px · `md` 6px · `lg` 8px. Restrained on purpose — editorial, not pill-shaped. Only avatars and status badges are fully round.
- **Elevation**: one token, `--shadow-raised`, for popovers, dialogs and the command palette. Cards and tables use borders. If you reach for a second shadow, the layout is wrong.
- **Focus**: one treatment application-wide — a 2px accent outline at 2px offset, defined once on `:focus-visible`.

---

## 7. Components

### Primitives — `src/components/ui/`

| Component | Notes |
|---|---|
| `Button` | Variants: `primary` (ink), `secondary`, `ghost`, `accent`, `danger`, `link`. Sizes `sm`/`md`/`lg`/`icon`/`iconSm`. `asChild` for links. |
| `Input`, `Textarea` | Shared field styling; height from `--control-h` |
| `Label` | With `required` marker |
| `Badge` | The StatusPill. Six tones, optional dot. |
| `Card` + `Header`/`Title`/`Body`/`Footer` | |
| `Checkbox` | Supports indeterminate — needed for table select-all |
| `DropdownMenu` | Item, CheckboxItem, Label, Separator, Shortcut; `destructive` item variant |
| `Dialog` | Header/Body/Footer, scrim, close affordance |
| `Tabs` | Underline style, not pills |
| `Tooltip`, `Avatar`, `Separator`, `Skeleton`, `Kbd` | |

Built on Radix primitives, styled entirely against Glide tokens. React 19 `ref`-as-prop is used throughout — no `forwardRef` anywhere.

### ERP composites — `src/components/erp/`

This is where the leverage is. Every module reuses these; **no module writes its own table or form layout.**

| Component | What it does |
|---|---|
| `DataTable` | The one table. Sortable headers, column picker, sticky header, density-aware rows, row selection, **"select all N matching this filter"** distinct from page-select, bulk action bar, pagination, empty state. A pure renderer — see §8. |
| `FilterBar` | Field-scoped search, quick-filter chips, removable active filters, **Group by** any field, **Saved views** (shared or private). The Stage 1 "enterprise vs admin panel" dividing line. |
| `PageHeader` | Breadcrumbs, display-weight title, status slot, meta line, action slot. Opens every screen. |
| `RecordShell` | The record-page frame: header, smart buttons, tabbed body, right metadata rail. |
| `StatusStepper` | Document lifecycle rendered from a server-defined state machine. Handles the cancelled terminal state separately. |
| `SmartButtons` | Related-document navigation with live counts — walk the document graph from any record. |
| `LineItemsTable` | Order/invoice lines with per-line tax and a totals footer carrying the tax breakdown. |
| `Money`, `Quantity`, `DateText`, `Code` | Locale-aware, tabular, right-aligned. Negatives render in `danger`. |
| `FieldGrid` / `Field` / `FormSection` | The standard label/value layout for every record view |
| `KpiTile` | Display-weight figure with delta |
| `AuditTrail` | Chatter v1 — the field-change log |
| `EmptyState` | |

### Layout shell — `src/components/layout/`

`AppShell` owns the three pieces of chrome state every screen inherits: sidebar collapse, density, and the tenant's country. Contains `Sidebar`, `Topbar`, `CommandPalette`, `GlideMark`.

### Not yet built (deliberate)

Combobox, MultiSelect, DatePicker, NumberInput/CurrencyInput, Sheet, Toast, Popover, Accordion, Pagination-as-component, Breadcrumbs-as-component. **These are built when a module first needs them**, against real requirements, rather than speculatively.

---

## 8. The query layer is separate from the renderer

The most important architectural decision in this stage, and it came directly from Stage 1 research.

`src/lib/query/record-query.ts` owns filtering, sorting, grouping and pagination as a standalone abstraction — `RecordQuery`, `RecordPage<T>`, `SavedView`, plus URL serialisation and a client-side evaluator whose semantics the server will mirror in SQL.

`DataTable` **consumes** a `RecordQuery`; it does not own one. One consequence: adding a kanban or pivot view later means writing a new renderer against the same query — days of work, not months. Odoo gets nine view types from this separation. If filtering had been built inside the table component we would pay for that mistake forever.

The same `RecordQuery` shape serves four masters:
- the **URL** (shareable, bookmarkable, back-button-safe list views)
- **saved views** (a named query, private or shared with the team)
- the **server query** in P1+
- **bulk actions**, which act on the predicate rather than on 3,400 row ids sent from a browser

---

## 9. Localization

`src/lib/i18n/countries.ts` + `src/lib/format.ts`.

The UI is English everywhere. Everything numeric, monetary and legal is country-driven. A country pack carries locale, currency, tax regime, tax label, tax-ID label, region label and time zone. **Adding a country is a row in a table plus a tax regime — never a change to a screen.**

Shipped: **IN, US, GB, AE, DE (EU)**.

No component calls `Intl` directly; everything goes through `formatMoney` / `formatQuantity` / `formatDate`, reading the active country from `FormatProvider`. Verified working end to end: switching to India renders `₹3,20,897.27` with Indian digit grouping, `₹1.7Cr` and `₹53.3L` in compact KPI figures, and splits tax into CGST + SGST; other regimes render a single tax line with the correct local label.

---

## 10. Screen archetypes

Every screen in Glide is one of two shapes. This is what makes 200 screens learnable.

**List view** — `PageHeader` (breadcrumbs, title, primary action) → `FilterBar` (search, quick filters, group by, saved views) → `DataTable` (toolbar with record count and column picker, bulk bar when selected, table, pagination).

**Record view** — `PageHeader` (breadcrumbs, document number, status pill, meta line, state stepper + contextual actions) → `SmartButtons` → tabbed body → right rail (details, activity).

Reference implementations: `src/app/app/sales/page.tsx` and `src/app/app/sales/[id]/page.tsx`.

---

## 11. Interaction rules

- **Keyboard first.** `Ctrl/Cmd+K` opens the command palette from anywhere — create actions and module jumps. None of Odoo, Zoho, NetSuite or Dynamics has this; it's the cheapest way to be visibly faster than all of them.
- **State machines are server-defined.** The UI renders the states it is given and never hardcodes "show the Confirm button." An invoiced order offers no Confirm; a cancelled one offers nothing.
- **Actions change with status.** The action slot in `PageHeader` is populated from the document's legal transitions.
- **Bulk selection distinguishes page from predicate.** Selecting every row on a page then offers "select all 3,400 matching this filter."
- **Permissions shape the UI and the server enforces it.** Nav items carry a `permission` string; hiding a control is never the security boundary.

---

## 12. Conventions

- `cn()` from `src/lib/utils.ts` merges classes; later Tailwind utilities win.
- Variants use `class-variance-authority`. If a component has more than two visual variants, it gets a `cva` block.
- Components take `React.ComponentProps<"element">` and spread. No `forwardRef` (React 19).
- Semantic tokens only. `bg-surface`, never `bg-white`. `text-ink-muted`, never `text-gray-500`.
- Heights come from `h-row` / `h-control`. Never a hardcoded pixel height on an interactive element.

---

## 13. Known gaps

Honest list of what this stage did not finish.

1. **The sales list is a client component.** It reads `useSearchParams`, so its SSR output is the Suspense fallback. Correct for mock data; in P1 it becomes a Server Component that runs the query server-side and passes a `RecordPage` down. The query layer was designed for exactly this.
2. **Group-by renders no grouped rows yet.** The control and the query field exist; the grouped renderer arrives with real data in P1.
3. **Saved views are not persisted.** UI and types are real; the table lands in P0's schema.
4. **No automated tests yet.** Vitest and Playwright come in with P0, alongside the database — testing mock data would be testing nothing.
5. **Accessibility pass not yet done.** Radix gives correct roles and focus management for free, and focus-visible is handled globally, but contrast has not been formally audited and there is no skip-link.

---

## 14. Verification

```bash
cd glide
npm run dev        # then open http://localhost:3000
npm run build      # passes clean: 0 type errors
```

Screens to look at: `/app` (overview), `/app/sales` (list archetype), `/app/sales/so_1000` (record archetype).

Things worth trying: the **country switcher** in the top bar (watch every number and the tax breakdown change), the **density toggle** next to it, the **theme menu**, `Ctrl+K`, selecting rows to reveal the bulk bar and the "select all matching" affordance, and the **Columns** picker.
