# Inventory

Glide tracks stock as a ledger: every receipt, delivery, transfer and
adjustment is its own permanent record. On-hand quantity is never a number
you edit directly — it's always the sum of that history, which is what
makes it trustworthy for an audit and impossible to silently drift out of
sync.

## Warehouses

**Inventory → Warehouses** in the sidebar. Each warehouse needs a code,
name, and address. A warehouse automatically gets an internal storage
location when you create it — you don't need to set locations up
separately for a simple single-location warehouse.

## Recording stock movements

**Inventory → Stock**, then pick the movement type:

| Movement | What it does | Fields |
|---|---|---|
| **Receive stock** | Stock arriving from outside (a purchase, opening balance) | Product, destination location, quantity, unit cost |
| **Deliver stock** | Stock leaving to a customer, outside a sales order | Product, source location, quantity |
| **Transfer stock** | Moving stock between two locations you own | Product, from, to, quantity |
| **Adjust stock** | Reconciling a physical count against what Glide shows | Product, location, direction (increase/decrease), quantity, unit cost (only if increasing) |

If a product is tracked by lot or serial number, the form asks for a lot or
serial number on any movement that adds stock.

Most of the time you won't use these directly for sales — confirming a
sales order and recording a delivery against it (see the
[Sales guide](./sales.md)) moves stock automatically. These screens are for
receiving purchased stock, correcting counts, and moving stock between
locations.

## The Stock screen's three tabs

**Levels** — on-hand quantity, average cost, and total value per product,
across every warehouse. A row is flagged if it's below its reorder point.
Average cost and value are only shown to roles that can also edit products
(Owner, Administrator) — a Warehouse-role user sees quantities but not
money, by design.

**Lots & serials** — every tracked batch or serial number currently in
stock, and where it is.

**Reorder rules** — set a minimum quantity per product per warehouse.
Fall below it and the product is flagged on the Levels tab. (Automatically
generating a purchase order from a reorder rule is a Purchasing-module
feature, not yet built.)
