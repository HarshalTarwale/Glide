# Procurement

**Purchase Orders** and **Bills** in the sidebar — the buy-side mirror of
Sales and Invoicing: order from a supplier, receive the goods into stock,
get billed, and pay it.

## Creating a purchase order

**Purchase Orders → New order.** Pick a supplier, a warehouse to receive
into, add lines (product, quantity, unit cost), and choose a **billing
policy**:

- **Bill what's ordered** — you can bill for the full ordered quantity as
  soon as the order is confirmed, even before anything arrives.
- **Bill what's received** — you can only bill for quantities that have
  actually been received. The safer default for most goods.

The order starts as **Draft** — lines are still editable. Click **Confirm**
when you're ready to send it to the supplier; confirming locks the lines
in and makes the order available for receiving.

## Receiving goods

On a confirmed order, click **Receive**. You'll see every line with
something left to receive; adjust quantities down for a partial delivery
(a supplier who ships half an order now and the rest later). Recording a
receipt raises on-hand stock in the destination warehouse immediately —
the same stock-move ledger that powers Inventory and Sales.

An order can be received more than once as partial shipments arrive; its
status keeps moving until every line is fully received.

## Billing

**From the order:** once there's something billable (per the order's
billing policy), click **Create bill**. You'll see every line with
something left to bill — adjust quantities down for a partial bill.

**Standalone:** **Bills → New bill**, pick a supplier, add lines. Useful
for a bill that doesn't trace back to a purchase order at all (a recurring
service charge, for example).

Either way, the bill starts as **Draft**. Click **Post** to finalize it —
this is a one-way step: once posted, a bill's lines can never be edited
again. Tax is calculated once, at posting, using whatever rates are
configured at that moment, and then frozen.

A draft bill can still be cancelled outright, if you catch a mistake
before posting. There is no debit-note equivalent of a credit note in
this version — once a bill is posted, correcting it takes a manual
adjustment outside Glide.

## Recording a payment

**Against one bill:** open it and click **Record payment**. Enter the
amount (defaults to the full outstanding balance), method, and an
optional reference.

**Across several bills at once:** go to **Supplier Payments → New
payment**, pick a supplier, and you'll see every open bill they have.
Enter an amount and spread it across as many bills as it covers.

A payment doesn't have to be fully allocated right away — record it with
no allocations and apply it later from the payment's own record page.

## Purchase order and bill status

| Status | Meaning |
|---|---|
| Draft | Editable. Not yet sent. |
| Confirmed | Locked in; open for receiving and (per billing policy) billing. |
| Partially received / Received | Derived from what's actually arrived, never set directly. |
| Cancelled | A draft or confirmed order that was called off. |

Bill status (Draft / Posted / Partially paid / Paid / Cancelled) works
exactly like an invoice's — see [Invoicing](./invoicing.md#invoice-status).

## AP Aging

**Supplier Payments → AP Aging** (or the sidebar's **AP Aging** entry).
Shows every supplier you owe money to, bucketed by how overdue it is:
Current, 1–30, 31–60, 61–90, and 90+ days past due — the mirror of AR
Aging, applied to what Glide owes rather than what it's owed.

## What posts to the ledger

Every posted bill and recorded supplier payment automatically creates the
matching journal entry in [Accounting](./accounting.md) — a bill debits
Cost of Goods Sold (and Tax Payable, if there's tax) and credits Accounts
Payable; a payment debits Accounts Payable and credits Cash. You never
need to post these by hand.
