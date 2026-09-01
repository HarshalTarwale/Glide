# Invoicing

**Invoices** in the sidebar. An invoice can come from a sales order, or be
created standalone (for a service, a one-off sale, or anything that
doesn't need an order behind it).

## Creating an invoice

**From a sales order:** open the order and click **Create invoice**. You'll
see every line with something left to invoice — under "invoice what is
delivered," that's the delivered-but-not-yet-invoiced quantity; under
"invoice what is ordered," it's the ordered-but-not-yet-invoiced quantity.
Adjust quantities down for a partial invoice, same as delivering.

**Standalone:** **Invoices → New invoice**, pick a customer, add lines, set
a due date if you want one.

Either way, the invoice starts as **Draft** — lines are still editable,
nothing has been charged yet.

## Posting

Click **Post**. This is a one-way step: once posted, an invoice's lines can
never be edited again, by anyone, including the Owner. If something was
wrong, the fix is a **credit note** (below), never an edit — the same way
you'd correct a mistake on a paper invoice you already mailed, rather than
scribbling over the copy the customer has.

Tax is calculated once, at posting, using whatever rates are configured at
that moment, and then frozen — even if you later change a tax rate, every
already-posted invoice keeps showing exactly what it charged at the time.

A draft invoice can still be cancelled outright, if you catch a mistake
before posting.

## Correcting a posted invoice: credit notes

On a posted invoice, click **Credit note**. Pick which line(s) to credit
and how much of each, and give a reason (required — it shows up in the
invoice's history). You can credit up to what remains on a line: partially
crediting one line across two separate credit notes is fine, as long as
the total never exceeds what was originally billed on it.

A credit note doesn't rewrite the original invoice — it's its own document,
listed on the invoice's **Credit notes** tab, that nets against what the
customer owes.

## Recording a payment

**Against one invoice:** open it and click **Record payment**. Enter the
amount (defaults to the full outstanding balance), method, and an optional
reference.

**Across several invoices at once:** go to **Payments → New payment**,
pick a customer, and you'll see every open invoice they have. Enter an
amount and spread it across as many invoices as it covers — this is the
flow for "pay ₹50,000 against three separate outstanding invoices in one
transaction."

A payment doesn't have to be fully allocated right away — if it arrives
before you know which invoice(s) it's for, record it with no allocations
and apply it later from the payment's own record page.

## Invoice status

| Status | Meaning |
|---|---|
| Draft | Editable. Nothing charged yet. |
| Posted | Final and immutable. Nothing paid against it yet. |
| Partially paid | Posted, and some but not all of it has been paid. |
| Paid | Posted, and payments cover the full total. |
| Cancelled | A draft that was discarded before posting. |

Like sales order status, this is never set directly — it's derived from
what's actually been paid.

## AR Aging

**Invoices → AR Aging** (or the sidebar's **AR Aging** entry). Shows every
customer with an outstanding balance, bucketed by how overdue it is:
Current, 1–30, 31–60, 61–90, and 90+ days past due. Only posted invoices
with money still owed on them show up here — a credit note or a payment
that fully settles an invoice removes it from the report.
