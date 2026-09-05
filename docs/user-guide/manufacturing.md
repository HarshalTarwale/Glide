# Manufacturing

**Bills of Materials** and **Work Orders** in the sidebar, under
Operations.

## What this covers, and what it doesn't

This is a simple make-to-order manufacturing flow: define what a product
is made of, create a work order to produce some quantity of it, complete
the work order, and Glide moves the stock for you. There's no routing or
work-center scheduling, no labour/machine time tracking, and no automatic
multi-level BOM explosion — if something you build is itself made from
sub-assemblies, run a separate work order for each level. These are
deliberate scope lines, not missing pieces of something already promised.

## Bill of Materials (BOM)

**Manufacturing → Bills of Materials → New BOM.** Pick the product this
BOM produces, how many units one "batch" makes, and the components (and
quantities) that batch consumes. If a BOM produces 10 units from 3 units
of a component, a work order for 5 units automatically scales that down
to 1.5 — you never have to do that math by hand.

Both the output product and every component must be plain, untracked
stock items (no lot or serial number) — manufacturing with tracked
materials is on the roadmap as a later addition, not supported yet.

A BOM can be deactivated once it's no longer current. Deactivating it
doesn't touch work orders that already exist against it — it only blocks
creating *new* ones.

## Work orders

**Manufacturing → Work Orders → New work order.** Pick a BOM, a
warehouse, and how many units to produce. Glide shows you exactly which
components and quantities that implies before you commit to anything.

A work order moves through three states:

| Status | Meaning |
|---|---|
| Draft | Editable. Nothing has happened yet. |
| Confirmed | Locked in, ready to run. Still hasn't touched stock. |
| Done | Completed — components consumed, finished good produced. |

**Confirm** locks the work order in. **Complete** is the step that
actually moves stock: every component is consumed from the warehouse (at
whatever it's currently costed at) and the finished good is added to
stock, all in the same instant. There's no partial completion in this
version — a work order is completed in full, for its entire planned
quantity, in one step.

A draft or confirmed work order can still be **cancelled** — nothing has
touched stock yet, so cancelling is free. Once completed, a work order is
done; there's no reversal button (undo it the same way you'd undo any
other stock movement, with a manual adjustment).

## How the produced cost is calculated

Glide doesn't ask you to configure a manufacturing cost. When a work order
completes, it adds up exactly what its components cost at that moment
(their real, current average cost) and divides that total by the quantity
produced. That's the finished good's cost for this batch — "actual
costing," not a fixed number that might drift from reality. Different
batches of the same product can end up costed slightly differently if
component costs moved between them, which is expected and correct.
