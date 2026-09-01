# Sales

**Sales** in the sidebar. A sales order in Glide covers both a quotation and
a confirmed order — it's the same document moving through statuses, so
nothing needs to be recreated when a quote is accepted.

## Creating an order

**New order**, then:

| Field | Notes |
|---|---|
| Customer | Must already exist in Contacts, and be marked as a customer. |
| Warehouse | Where the stock will ship from. |
| Invoicing policy | **Invoice what is delivered** (the standard for physical goods — you can't invoice what hasn't shipped) or **Invoice what is ordered** (for services or prepaid goods, where you bill up front). |
| Expected delivery | Optional. |
| Lines | Product, quantity, unit price (defaults from the product or an applicable price list), discount %. |

A new order starts as **Draft**. Nothing is committed yet — you can freely
edit its lines.

## The order lifecycle

| Status | Meaning |
|---|---|
| Draft | Being built. Lines are editable. |
| Confirmed | Committed. Lines are locked. Nothing has shipped yet — confirming does not touch stock. |
| Partially delivered | Some, not all, of the order has shipped. |
| Delivered | Everything ordered has shipped. |
| Invoiced | Fully delivered and fully invoiced — the terminal state. |
| Cancelled | Only possible from Draft or Confirmed, and only if nothing has shipped yet. |

Status is never something you set directly — Glide derives it from what's
actually been delivered and invoiced against the order's lines. That's what
makes "partially delivered" trustworthy: it's a fact about the order, not
someone's guess.

## Confirming an order

Click **Confirm**. This locks the order's lines and moves it to Confirmed.
Stock is not reserved or moved at this point — overselling is prevented
when stock actually ships, not by a soft hold placed at confirmation.

## Delivering

Once confirmed, click **Deliver**. You'll see every line with something
left to ship, defaulted to the full remaining quantity — adjust down for a
partial shipment. Confirming the dialog creates the delivery and reduces
on-hand stock immediately; you'll see it reflected on the
[Inventory Stock screen](./inventory.md) right away.

You can deliver an order across as many separate shipments as you need —
partial fulfilment is the normal case in Glide, not a special one.

## Invoicing an order

Once there's something to invoice (per the order's invoicing policy —
delivered quantity, or ordered quantity if the policy is "invoice what is
ordered"), click **Create invoice** on the order. See the
[Invoicing guide](./invoicing.md) for what happens from there.

## Cancelling

Only available while an order is still Draft or Confirmed, and only if
nothing has been delivered against it yet. Once any delivery has happened,
the order can no longer be cancelled outright — see credit notes in the
[Invoicing guide](./invoicing.md) for how to unwind a mistake after the
fact.
