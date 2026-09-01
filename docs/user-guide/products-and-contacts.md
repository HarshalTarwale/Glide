# Products & Contacts

These are the two lists everything else in Glide is built on: what you
sell, and who you sell it to. Set these up before creating your first sales
order or invoice.

## Products

**Inventory → Products** in the sidebar.

| Field | Notes |
|---|---|
| SKU | Your own product code. Must be unique. |
| Type | **Goods** (physical, tracked in stock) or **Service** (sellable, never delivered — no stock moves). |
| Name | What shows on quotes, orders and invoices. |
| Unit of measure | pcs, kg, etc. — set up under the same screen's UoM data, or use what's pre-seeded. |
| Category | Optional grouping. |
| Sales price | Your default list price. A price list can override this per customer, if you've set one up. |
| Cost price | What it costs you. Only visible to roles that can also edit products (Owner, Administrator) — Sales and Warehouse roles never see this, by design, since it's margin-sensitive. |
| HSN / SAC code | India only — required on GST invoices above a turnover threshold. |
| Tax category | Which tax rate this product falls under (Standard, Reduced, Zero, Exempt). |
| Stock tracking | None, Lot, or Serial — whether individual units of this product need to be tracked by batch or serial number. |
| Sellable / Purchasable / Active | Toggle whether this product can currently be sold, bought, or is archived. |

## Contacts

**Contacts** in the sidebar. A contact can be a customer, a supplier, or
both — Glide uses one record for all of them rather than separate customer
and supplier lists, so a company you both buy from and sell to only needs
one entry.

**Details**
| Field | Notes |
|---|---|
| Name, Kind | Company or Person. |
| Is customer / Is supplier | Check either or both. |
| Email, Phone, Website | |
| Currency | Defaults to your company's currency; override per contact if they trade in a different one. |
| Payment term (days) | 0 = due on receipt. Feeds the due date on any invoice raised against them. |
| Credit limit | Informational for now. |

**Billing address** — used for tax calculation (place of supply for GST,
sourcing for US sales tax) as well as printing on invoices.

**Tax registration** — their GSTIN / VAT number / TRN / EIN, which country
it's registered in, whether they're a registered business (unregistered
buyers are handled differently for GST/VAT), and for EU/UK B2B, whether
reverse charge applies.

A contact can have several tax registrations if they trade from more than
one jurisdiction — common for Indian businesses with a separate GSTIN per
state.
