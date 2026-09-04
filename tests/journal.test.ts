import { describe, expect, it } from "vitest";
import {
  isBalanced,
  balanceDelta,
  sumLines,
  isDebitNormal,
  accountBalance,
  buildTrialBalance,
  buildIncomeStatement,
  buildBalanceSheet,
  type TrialBalanceAccountInput,
  type AccountBalanceInput,
} from "@/lib/accounting/journal";

describe("isBalanced — the one invariant this whole module exists to enforce", () => {
  it("a balanced entry (debits equal credits) is balanced", () => {
    expect(isBalanced([{ debit: 1000, credit: 0 }, { debit: 0, credit: 1000 }])).toBe(true);
  });

  it("an unbalanced entry is not", () => {
    expect(isBalanced([{ debit: 1000, credit: 0 }, { debit: 0, credit: 900 }])).toBe(false);
  });

  it("a zero-total entry (no lines, or all-zero lines) is not balanced -- there's nothing to post", () => {
    expect(isBalanced([])).toBe(false);
    expect(isBalanced([{ debit: 0, credit: 0 }])).toBe(false);
  });

  it("balances across more than two lines, split across several debits and credits", () => {
    const lines = [
      { debit: 600, credit: 0 },
      { debit: 400, credit: 0 },
      { debit: 0, credit: 250 },
      { debit: 0, credit: 750 },
    ];
    expect(isBalanced(lines)).toBe(true);
  });

  it("balanceDelta reports the exact imbalance, signed", () => {
    expect(balanceDelta([{ debit: 1000, credit: 0 }, { debit: 0, credit: 900 }])).toBe(100);
    expect(balanceDelta([{ debit: 900, credit: 0 }, { debit: 0, credit: 1000 }])).toBe(-100);
    expect(balanceDelta([{ debit: 1000, credit: 0 }, { debit: 0, credit: 1000 }])).toBe(0);
  });
});

describe("isDebitNormal — the accounting-equation sign convention", () => {
  it("assets and expenses are debit-normal", () => {
    expect(isDebitNormal("asset")).toBe(true);
    expect(isDebitNormal("expense")).toBe(true);
  });

  it("liabilities, equity and revenue are credit-normal", () => {
    expect(isDebitNormal("liability")).toBe(false);
    expect(isDebitNormal("equity")).toBe(false);
    expect(isDebitNormal("revenue")).toBe(false);
  });
});

describe("accountBalance", () => {
  it("an asset account's balance is its net debit", () => {
    const lines = [{ debit: 5000, credit: 0 }, { debit: 0, credit: 1200 }];
    expect(accountBalance("asset", lines)).toBe(3800);
  });

  it("a liability account's balance is its net credit", () => {
    const lines = [{ debit: 0, credit: 2000 }, { debit: 500, credit: 0 }];
    expect(accountBalance("liability", lines)).toBe(1500);
  });

  it("a revenue account posted only via credits (the normal case) shows a positive balance", () => {
    expect(accountBalance("revenue", [{ debit: 0, credit: 10000 }])).toBe(10000);
  });
});

describe("sumLines", () => {
  it("sums debit and credit columns independently", () => {
    const lines = [{ debit: 100, credit: 0 }, { debit: 50, credit: 0 }, { debit: 0, credit: 75 }];
    expect(sumLines(lines)).toEqual({ totalDebit: 150, totalCredit: 75 });
  });
});

describe("buildTrialBalance", () => {
  it("nets each account's debit and credit into a single column, and the two columns match", () => {
    const accounts: TrialBalanceAccountInput[] = [
      { accountId: "ar", code: "1100", name: "Accounts Receivable", type: "asset", lines: [{ debit: 1180, credit: 0 }] },
      { accountId: "rev", code: "4000", name: "Sales Revenue", type: "revenue", lines: [{ debit: 0, credit: 1000 }] },
      { accountId: "tax", code: "2100", name: "Tax Payable", type: "liability", lines: [{ debit: 0, credit: 180 }] },
    ];
    const tb = buildTrialBalance(accounts);
    expect(tb.balanced).toBe(true);
    expect(tb.totalDebit).toBe(1180);
    expect(tb.totalCredit).toBe(1180);
    expect(tb.rows.find((r) => r.accountId === "ar")!.debit).toBe(1180);
    expect(tb.rows.find((r) => r.accountId === "rev")!.credit).toBe(1000);
  });

  it("omits a zero-balance account entirely", () => {
    const accounts: TrialBalanceAccountInput[] = [
      { accountId: "empty", code: "9999", name: "Untouched", type: "asset", lines: [{ debit: 500, credit: 500 }] },
    ];
    expect(buildTrialBalance(accounts).rows).toHaveLength(0);
  });

  it("an account with a balance opposite its normal side still lands in the correct trial-balance column (net, not type-based)", () => {
    // A liability account that's been overpaid into a net debit position --
    // the trial balance shows it as a debit, exactly matching its raw net,
    // regardless of what's "normal" for a liability.
    const accounts: TrialBalanceAccountInput[] = [
      { accountId: "ap", code: "2000", name: "Accounts Payable", type: "liability", lines: [{ debit: 300, credit: 100 }] },
    ];
    const tb = buildTrialBalance(accounts);
    expect(tb.rows[0].debit).toBe(200);
    expect(tb.rows[0].credit).toBe(0);
  });
});

describe("buildIncomeStatement", () => {
  it("computes net income as revenue minus expense", () => {
    const accounts: AccountBalanceInput[] = [
      { accountId: "rev", code: "4000", name: "Sales Revenue", type: "revenue", lines: [{ debit: 0, credit: 50000 }] },
      { accountId: "cogs", code: "5000", name: "Cost of Goods Sold", type: "expense", lines: [{ debit: 30000, credit: 0 }] },
    ];
    const stmt = buildIncomeStatement(accounts);
    expect(stmt.totalRevenue).toBe(50000);
    expect(stmt.totalExpense).toBe(30000);
    expect(stmt.netIncome).toBe(20000);
  });

  it("a net loss is a negative netIncome, not clamped to zero", () => {
    const accounts: AccountBalanceInput[] = [
      { accountId: "rev", code: "4000", name: "Sales Revenue", type: "revenue", lines: [{ debit: 0, credit: 10000 }] },
      { accountId: "exp", code: "5000", name: "Expenses", type: "expense", lines: [{ debit: 15000, credit: 0 }] },
    ];
    expect(buildIncomeStatement(accounts).netIncome).toBe(-5000);
  });

  it("ignores non-revenue/expense accounts entirely", () => {
    const accounts: AccountBalanceInput[] = [
      { accountId: "cash", code: "1000", name: "Cash", type: "asset", lines: [{ debit: 99999, credit: 0 }] },
    ];
    const stmt = buildIncomeStatement(accounts);
    expect(stmt.revenue).toHaveLength(0);
    expect(stmt.expense).toHaveLength(0);
    expect(stmt.netIncome).toBe(0);
  });
});

describe("buildBalanceSheet", () => {
  it("balances when the ledger is internally consistent: Assets = Liabilities + Equity (+ current net income)", () => {
    // A single invoice posting: Dr AR 1180, Cr Revenue 1000, Cr Tax Payable 180.
    const accounts: AccountBalanceInput[] = [
      { accountId: "ar", code: "1100", name: "Accounts Receivable", type: "asset", lines: [{ debit: 1180, credit: 0 }] },
      { accountId: "tax", code: "2100", name: "Tax Payable", type: "liability", lines: [{ debit: 0, credit: 180 }] },
    ];
    const netIncome = 1000; // Sales Revenue's balance, computed separately by buildIncomeStatement.
    const sheet = buildBalanceSheet(accounts, netIncome);

    expect(sheet.totalAssets).toBe(1180);
    expect(sheet.totalLiabilities).toBe(180);
    expect(sheet.totalEquity).toBe(1000);
    expect(sheet.outOfBalance).toBe(0);
  });

  it("flags an inconsistent ledger via a nonzero outOfBalance rather than silently misreporting", () => {
    const accounts: AccountBalanceInput[] = [
      { accountId: "ar", code: "1100", name: "Accounts Receivable", type: "asset", lines: [{ debit: 1180, credit: 0 }] },
    ];
    // Deliberately wrong net income, simulating a ledger that doesn't actually balance.
    const sheet = buildBalanceSheet(accounts, 500);
    expect(sheet.outOfBalance).toBe(680);
  });

  it("omits zero-balance accounts from every section", () => {
    const accounts: AccountBalanceInput[] = [
      { accountId: "unused", code: "1900", name: "Unused Asset", type: "asset", lines: [] },
    ];
    const sheet = buildBalanceSheet(accounts, 0);
    expect(sheet.assets).toHaveLength(0);
  });
});
