# Glide User Guide

Glide is a business system for a small or mid-size company: define what you
sell, track what you have in stock, sell it, and get paid — with tax handled
correctly for India, the US, the UK, the UAE, and the EU.

This guide is written for the person actually using Glide day to day, not
for a developer. If you're looking for how Glide is built, see `docs/architecture.md`.

## Guides

1. **Getting started** (this page) — creating your organisation, signing in, understanding roles
2. [Settings](./settings.md) — your company profile, tax rates, and localization
3. [Products & Contacts](./products-and-contacts.md) — the master data everything else is built from
4. [Inventory](./inventory.md) — warehouses, receiving stock, transfers, adjustments, stock levels
5. [Sales](./sales.md) — quotes, orders, and deliveries
6. [Invoicing](./invoicing.md) — invoices, credit notes, payments, and AR aging
7. [Accounting](./accounting.md) — the general ledger, chart of accounts, journal entries, and financial reports
8. [CRM](./crm.md) — leads, the sales pipeline, and follow-ups
9. [Procurement](./procurement.md) — purchase orders, receiving, bills, and supplier payments
10. [HR](./hr.md) — the employee directory, departments, and leave requests
11. [Manufacturing](./manufacturing.md) — bills of materials and work orders
12. [Overview & Business Insights](./insights.md) — your homepage, and cross-module analytics

## Creating your organisation

Go to `/signup`. You'll need:

| Field | What it's for |
|---|---|
| Organisation | Your company's name in Glide. You can add more legal entities later under Settings. |
| Country | Sets your default currency, number formatting, and which tax rules apply (GST for India, VAT for the UK/EU/UAE, sales tax for the US). You can change this later, but it's worth getting right up front. |
| Your name, work email, password | Your own sign-in. Password needs to be at least 8 characters. |

Submitting the form creates your organisation and signs you in as its
**Owner** — the one role that can never be removed and always has full
access.

Glide comes pre-loaded with sensible starting data for your country: a
default warehouse, standard units of measure (pieces, kilograms, etc.), and
the standard tax categories and rates for wherever you signed up from. You
can adjust all of it from Settings.

## Signing in later

Go to `/login` with the email and password you signed up with.

## Roles — who can do what

Every person you add to Glide holds one or more **roles**. Glide ships with
seven:

| Role | What they can do |
|---|---|
| **Owner** | Everything. The person who created the organisation. Cannot be removed. |
| **Administrator** | Everything except the things reserved for the Owner (like deleting the organisation). |
| **Sales Manager** | Full access to customers, sales orders, invoices, credit notes, payments, and CRM (leads/pipeline) across the whole team. Can see products and stock, but read-only. |
| **Sales Representative** | Can create and confirm their own orders, manage their own customers, and work their own leads and pipeline. Cannot cancel a confirmed order, and only sees their own records — not the whole team's. |
| **Warehouse** | Receives, moves, and adjusts stock. Cannot see cost prices or stock valuation, and has no access to pricing or invoicing. |
| **Accountant** | Full access to invoices, credit notes, and payments. Read-only on sales orders and products. Can see the Audit Log. |
| **Viewer** | Read-only across everything. Good for someone who needs visibility without the ability to change anything. |

A person can hold more than one role — they get the sum of what every role
they hold allows, never a restriction. Someone who is both a Sales
Representative and a Warehouse role, for example, can do both jobs.

You can see the exact permission count and record-scope for each role
under **Settings → Roles**.

### Adding teammates

**Settings → Members → Invite member.** Pick their email and which role(s)
they should have. This creates a real invitation and gives you a link.

Glide emails them the link automatically and also shows it to you to copy,
in case you'd rather send it another way (Slack, WhatsApp, etc.) or the
email doesn't arrive. The link is valid for 7 days and works once. If it's
lost or expires, inviting the same address again issues a fresh one.

When they open the link, they set a name and password (or, if they already
have a Glide account from elsewhere, just sign in) and they're in — with
exactly the role(s) you picked.

From the same **Members** screen you can change anyone's roles or remove
them later. The organisation Owner can't be changed or removed by anyone,
including themselves.

## Finding your way around

The left sidebar is grouped by area:

- **Operations** — Inventory, Stock, Warehouses, Sales, Purchase Orders, Bills of Materials, Work Orders
- **Finance** — Invoices, Payments, AR Aging, Bills, Supplier Payments, AP Aging
- **Accounting** — Chart of Accounts, Journal Entries, Reports, Business Insights
- **Relationships** — Contacts, Leads, Pipeline
- **People** — Employees, Departments, Leave Requests, Leave Types
- **Setup** — Audit Log, Settings

Every list screen (Products, Contacts, Sales Orders, Invoices, Payments,
the Audit Log) works the same way: a search box, quick filters, sortable
columns, and a **New** button where you have permission to create one.
Every record page (an individual order, invoice, or payment) shows a
status badge, the record's own detail tabs, an activity history on the
right, and whatever actions make sense for its current status — Glide only
ever shows you actions that are actually legal for where a document
currently is.
