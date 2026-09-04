# Accounting

Glide keeps a real general ledger underneath everything else — every
invoice you post, every payment you record, every credit note you issue
writes itself into the books automatically, in proper double-entry form.
You don't have to do anything for this to happen; this page covers what
you can see and do on top of it.

## How it works, briefly

Every entry in the ledger has at least two lines, and the total debited
always equals the total credited — that's what "double-entry" means, and
Glide enforces it: nothing can be posted to the ledger unless it balances,
no exceptions.

When you post an invoice, pay one, or issue a credit note, Glide creates
the matching ledger entry for you automatically:

| You do this | Glide posts |
|---|---|
| Post an invoice | Debit Accounts Receivable, Credit Sales Revenue (and Tax Payable, if there's tax) |
| Record a payment | Debit Cash and Bank, Credit Accounts Receivable |
| Issue a credit note | The exact reverse of the invoice posting, for the credited amount |

You never have to enter these yourself, and you never edit one after the
fact — same rule as everywhere else in Glide: a mistake is corrected with
a new, opposite entry, not by changing history.

## Chart of Accounts

**Accounting → Chart of Accounts.** Your organisation starts with eight
accounts already set up — Cash and Bank, Accounts Receivable, Inventory,
Accounts Payable, Tax Payable, Retained Earnings, Sales Revenue, and Cost
of Goods Sold. The ones marked **(system)** are what the automatic postings
above use — you can rename them or fold them into your own numbering
scheme, but their type (asset, liability, etc.) is locked, and they can't
be deactivated.

Add your own accounts for anything else your books need — specific
expense categories, for example. Click **New account** and give it a code,
name, and type.

## Journal Entries

**Accounting → Journal Entries** lists everything ever posted to the
ledger — automatic and manual side by side, with a **Source** column
showing which came from an invoice or payment (click through to see the
original document).

**Recording something manually:** click **New entry** — an opening
balance, a bank fee, a manual adjustment, anything Glide doesn't post for
you automatically. Add lines against whichever accounts apply; the form
shows you live whether it balances yet, and won't let you post until it
does. A draft entry can be deleted and re-entered if you make a mistake
before posting; once posted, it's permanent.

## Reports

**Accounting → Reports**, three tabs:

- **Trial Balance** — every account's balance as of today, debits and
  credits in their own columns. The two columns always match; if they
  ever didn't, something would be seriously wrong with the ledger itself
  (which the software refuses to allow, by construction).
- **Income Statement** — revenue minus expense for the current year, with
  net income at the bottom.
- **Balance Sheet** — what you own, what you owe, and what's left over,
  as of today. Assets should always equal Liabilities plus Equity; a
  badge tells you if it doesn't.

> **Scope note:** the Balance Sheet folds the current year's net income
> straight into Equity rather than requiring a formal month/year-end
> closing step — the common simplification for a v1. Inventory movements
> (stock received and delivered) don't post to the ledger automatically
> yet; that wiring is a planned addition, not a current feature.
