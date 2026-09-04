/**
 * Double-entry math — pure functions, no database. Mirrors
 * src/lib/sales/order-status.ts and src/lib/invoicing/invoice-status.ts
 * deliberately: the one rule this whole module exists to enforce (a
 * journal entry's debits must equal its credits, always) lives here,
 * dependency-free, so a test can hammer it without Postgres.
 *
 * The service layer (src/server/accounting/journal-entries.ts) calls
 * isBalanced() before every post; nothing here ever gets called from a
 * DB trigger, by design -- a trigger would duplicate logic the UI also
 * needs for a live "does this balance yet" indicator while drafting.
 */

export type AccountType = "asset" | "liability" | "equity" | "revenue" | "expense";

export interface JournalLineAmounts {
  debit: number;
  credit: number;
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function sumLines(lines: JournalLineAmounts[]): { totalDebit: number; totalCredit: number } {
  return {
    totalDebit: round2(lines.reduce((s, l) => s + l.debit, 0)),
    totalCredit: round2(lines.reduce((s, l) => s + l.credit, 0)),
  };
}

/** THE invariant. A journal entry may only be posted when this is true. */
export function isBalanced(lines: JournalLineAmounts[]): boolean {
  const { totalDebit, totalCredit } = sumLines(lines);
  return totalDebit === totalCredit && totalDebit > 0;
}

export function balanceDelta(lines: JournalLineAmounts[]): number {
  const { totalDebit, totalCredit } = sumLines(lines);
  return round2(totalDebit - totalCredit);
}

/**
 * Whether a debit increases (true) or a credit increases (false) this
 * account type's balance -- the accounting-equation sign convention
 * (Assets = Liabilities + Equity; Equity increases with Revenue, decreases
 * with Expense). Everything in reports.ts that turns raw debit/credit sums
 * into a signed "the balance of this account is X" figure goes through
 * this, once, so the convention can never drift between reports.
 */
export function isDebitNormal(type: AccountType): boolean {
  return type === "asset" || type === "expense";
}

/** An account's balance in its own normal-balance terms (positive = normal direction, negative = unusual/overdrawn). */
export function accountBalance(type: AccountType, lines: JournalLineAmounts[]): number {
  const { totalDebit, totalCredit } = sumLines(lines);
  return isDebitNormal(type) ? round2(totalDebit - totalCredit) : round2(totalCredit - totalDebit);
}

/* ------------------------------------------------------------------ */
/* Trial balance                                                       */
/* ------------------------------------------------------------------ */

export interface TrialBalanceAccountInput {
  accountId: string;
  code: string;
  name: string;
  type: AccountType;
  lines: JournalLineAmounts[];
}

export interface TrialBalanceRow {
  accountId: string;
  code: string;
  name: string;
  type: AccountType;
  /** Net debit-side amount for THIS row's display column -- never both nonzero on one row. */
  debit: number;
  credit: number;
}

export interface TrialBalance {
  rows: TrialBalanceRow[];
  totalDebit: number;
  totalCredit: number;
  /** True iff totalDebit === totalCredit -- the report's own self-check. A trial balance that doesn't balance means a JournalEntry was posted unbalanced somewhere, which isBalanced() should have made impossible. */
  balanced: boolean;
}

/**
 * The classic trial-balance convention: each account's raw net
 * (debit - credit) lands in the debit column if positive, the credit
 * column if negative -- independent of the account's TYPE. This is
 * deliberately different from accountBalance() above (which is
 * type-aware): a trial balance is a mechanical check that the ledger
 * itself balances, not a statement of financial position.
 */
export function buildTrialBalance(accounts: TrialBalanceAccountInput[]): TrialBalance {
  const rows: TrialBalanceRow[] = [];
  let totalDebit = 0;
  let totalCredit = 0;

  for (const account of accounts) {
    const { totalDebit: d, totalCredit: c } = sumLines(account.lines);
    const net = round2(d - c);
    if (net === 0) continue; // A zero-balance account adds no signal to a trial balance.

    const debit = net > 0 ? net : 0;
    const credit = net < 0 ? -net : 0;
    rows.push({ accountId: account.accountId, code: account.code, name: account.name, type: account.type, debit, credit });
    totalDebit = round2(totalDebit + debit);
    totalCredit = round2(totalCredit + credit);
  }

  return { rows, totalDebit, totalCredit, balanced: totalDebit === totalCredit };
}

/* ------------------------------------------------------------------ */
/* Balance sheet & income statement                                    */
/* ------------------------------------------------------------------ */

export interface AccountBalanceInput {
  accountId: string;
  code: string;
  name: string;
  type: AccountType;
  lines: JournalLineAmounts[];
}

export interface StatementLine {
  accountId: string;
  code: string;
  name: string;
  balance: number;
}

export interface IncomeStatement {
  revenue: StatementLine[];
  expense: StatementLine[];
  totalRevenue: number;
  totalExpense: number;
  netIncome: number;
}

/** Revenue - Expense for whatever set of lines the caller already filtered to a date range. */
export function buildIncomeStatement(accounts: AccountBalanceInput[]): IncomeStatement {
  const revenue = accounts
    .filter((a) => a.type === "revenue")
    .map((a) => ({ accountId: a.accountId, code: a.code, name: a.name, balance: accountBalance("revenue", a.lines) }))
    .filter((l) => l.balance !== 0);
  const expense = accounts
    .filter((a) => a.type === "expense")
    .map((a) => ({ accountId: a.accountId, code: a.code, name: a.name, balance: accountBalance("expense", a.lines) }))
    .filter((l) => l.balance !== 0);

  const totalRevenue = round2(revenue.reduce((s, l) => s + l.balance, 0));
  const totalExpense = round2(expense.reduce((s, l) => s + l.balance, 0));

  return { revenue, expense, totalRevenue, totalExpense, netIncome: round2(totalRevenue - totalExpense) };
}

export interface BalanceSheet {
  assets: StatementLine[];
  liabilities: StatementLine[];
  equity: StatementLine[];
  totalAssets: number;
  totalLiabilities: number;
  /** Equity accounts' own balances PLUS current-period net income -- see this file's header note on why there's no formal period close in v1. */
  totalEquity: number;
  /** totalAssets - (totalLiabilities + totalEquity). Should be 0 whenever the ledger is internally consistent -- the report's own self-check. */
  outOfBalance: number;
}

/**
 * `accounts` should be every LedgerAccount with ALL its lines up to the
 * as-of date (assets/liabilities/equity are point-in-time balances, not
 * period balances). `currentPeriodNetIncome` is buildIncomeStatement()'s
 * netIncome for the same as-of date computed from the start of the fiscal
 * year -- passed in rather than recomputed here, so the caller controls
 * exactly what "current period" means.
 */
export function buildBalanceSheet(accounts: AccountBalanceInput[], currentPeriodNetIncome: number): BalanceSheet {
  const line = (a: AccountBalanceInput) => ({ accountId: a.accountId, code: a.code, name: a.name, balance: accountBalance(a.type, a.lines) });

  const assets = accounts.filter((a) => a.type === "asset").map(line).filter((l) => l.balance !== 0);
  const liabilities = accounts.filter((a) => a.type === "liability").map(line).filter((l) => l.balance !== 0);
  const equity = accounts.filter((a) => a.type === "equity").map(line).filter((l) => l.balance !== 0);

  const totalAssets = round2(assets.reduce((s, l) => s + l.balance, 0));
  const totalLiabilities = round2(liabilities.reduce((s, l) => s + l.balance, 0));
  const totalEquity = round2(equity.reduce((s, l) => s + l.balance, 0) + currentPeriodNetIncome);

  return {
    assets,
    liabilities,
    equity,
    totalAssets,
    totalLiabilities,
    totalEquity,
    outOfBalance: round2(totalAssets - (totalLiabilities + totalEquity)),
  };
}
