# Settings

`Settings` in the left sidebar (under **Setup**) is where your organisation's
own details, tax configuration, and roles live. Most of it needs
`core:settings:write` (Owner and Administrator hold it by default) to edit;
anyone with `core:settings:read` can view it.

## Organisation

Your company's legal name, tax ID, and address. Click the pencil icon to
edit:

| Field | Notes |
|---|---|
| Name | Required. What shows on documents. |
| Legal name | Only if different from the display name. |
| Tax ID | GSTIN in India, VAT number in the UK/EU, TRN in the UAE, EIN in the US — the label changes based on your country. |
| Address line, City, Region, Postal code | Region matters most: it's what GST uses to work out whether a sale is intra-state (CGST + SGST) or inter-state (IGST), and what US sales tax uses to find the right state/county/city rate stack. |

Until your company's region is filled in, GST-country tenants can't
calculate tax correctly on a real order or invoice — the tax engine refuses
to guess rather than silently under- or over-charging.

## Localization

Read-only summary of what your country selection set up: currency, tax
regime, how numbers are formatted, and your time zone. To change your
country, edit it from the Organisation section above (this is one of the
few things worth getting right at signup, since it drives which tax engine
runs).

## Tax engine

A live preview of what the tax engine actually computes for your country —
the exact same calculation every sales order and invoice uses. Switching
your country in the top bar shows you another regime's output without
changing any real data.

## Tax rates

The actual jurisdiction rates Glide charges. India, the UK, the EU, and the
UAE come pre-seeded with standard rates you can adjust. **US sales tax has
no built-in default** — American tenants must add at least one rate here
(state, and county/city if you collect at that level) before US orders will
calculate any tax at all.

Each rate has:

| Field | Notes |
|---|---|
| Name | e.g. "Texas state sales tax" |
| Country / Region | Region is the state/county/emirate this rate applies in. Leave it blank for a country-wide rate. |
| Level | national / state / county / city — controls how US rates stack (state + county + city can all apply to the same sale). |
| Rate | A percentage, e.g. `8.25`. |
| Category | Which products this rate applies to — most things are "Standard"; some countries also have reduced, zero-rated, or exempt categories. |

## Members

Who's actually in your organisation, and what they can do. Needs
`core:member:read` to view, `core:member:invite` to invite someone or
change an existing member's roles, `core:member:remove` to remove one.

**Inviting someone:** click **Invite member**, enter their email, and pick
one or more roles. This creates a real invitation (valid 7 days, usable
once) and shows you a link — there's no automatic email yet, so send it
to them however you normally would. Re-inviting the same address issues a
fresh link.

**Pending invitations** lists everyone who's been invited but hasn't
joined yet, with a **revoke** button if you need to cancel one.

**Editing an existing member:** click the roles-pencil icon next to them
to change what they can do, or the trash icon to remove them entirely. The
organisation Owner can't be edited or removed by anyone — that protection
is enforced by the server, not just hidden in the UI.

## Roles

A read-only table of the seven built-in roles, how many permissions each
holds, and their record scope (whether they see every record or only their
own — Sales Representative and Warehouse are scoped this way). See the
[Getting Started guide](./README.md#roles--who-can-do-what) for what each
one is for.

## Platform status

A quick health check: whether the database is connected, whether
tenant-isolation (row-level security) is enforced, and whether you're
currently signed in. Useful if something looks wrong and you want to rule
out "not actually connected to anything" before digging further.
