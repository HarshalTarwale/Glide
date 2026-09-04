"use client";

import { PageHeader } from "@/components/erp/page-header";
import { Card, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Money, DateText } from "@/components/erp/money";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { TrialBalance, IncomeStatement, BalanceSheet } from "@/lib/accounting/journal";

export function ReportsView({
  trialBalance,
  incomeStatement,
  balanceSheet,
  asOf,
  periodStart,
}: {
  trialBalance: TrialBalance;
  incomeStatement: IncomeStatement;
  balanceSheet: BalanceSheet;
  asOf: string;
  periodStart: string;
}) {
  return (
    <>
      <PageHeader
        title="Reports"
        crumbs={[{ label: "Accounting" }, { label: "Reports" }]}
        meta={
          <span>
            As of <DateText value={asOf} />
          </span>
        }
      />

      <div className="flex-1 overflow-auto px-6 py-6">
        <Tabs defaultValue="trial-balance">
          <TabsList>
            <TabsTrigger value="trial-balance">Trial Balance</TabsTrigger>
            <TabsTrigger value="income-statement">Income Statement</TabsTrigger>
            <TabsTrigger value="balance-sheet">Balance Sheet</TabsTrigger>
          </TabsList>

          <TabsContent value="trial-balance">
            <Card>
              <CardBody className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-ink-muted">Every account with a posted balance, as of today.</p>
                  <Badge tone={trialBalance.balanced ? "success" : "danger"} dot>
                    {trialBalance.balanced ? "Balanced" : "Out of balance"}
                  </Badge>
                </div>
                {trialBalance.rows.length === 0 ? (
                  <p className="text-sm text-ink-subtle">Nothing posted yet.</p>
                ) : (
                  <div className="overflow-hidden rounded-lg border border-hairline">
                    <table className="w-full border-collapse text-sm">
                      <thead>
                        <tr className="border-b border-hairline bg-surface-sunken text-2xs uppercase tracking-wide text-ink-subtle">
                          <th className="px-3 py-2 text-left font-semibold">Code</th>
                          <th className="px-3 py-2 text-left font-semibold">Account</th>
                          <th className="px-3 py-2 text-right font-semibold">Debit</th>
                          <th className="px-3 py-2 text-right font-semibold">Credit</th>
                        </tr>
                      </thead>
                      <tbody>
                        {trialBalance.rows.map((r) => (
                          <tr key={r.accountId} className="border-b border-hairline last:border-0">
                            <td className="px-3 py-2 font-mono text-xs text-ink-subtle">{r.code}</td>
                            <td className="px-3 py-2 text-ink">{r.name}</td>
                            <td className="px-3 py-2 text-right tnum">{r.debit > 0 ? <Money value={r.debit} /> : "—"}</td>
                            <td className="px-3 py-2 text-right tnum">{r.credit > 0 ? <Money value={r.credit} /> : "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="border-t border-hairline bg-surface-sunken font-medium">
                          <td colSpan={2} className="px-3 py-2 text-right text-xs text-ink-muted">
                            Totals
                          </td>
                          <td className="px-3 py-2 text-right tnum">
                            <Money value={trialBalance.totalDebit} />
                          </td>
                          <td className="px-3 py-2 text-right tnum">
                            <Money value={trialBalance.totalCredit} />
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </CardBody>
            </Card>
          </TabsContent>

          <TabsContent value="income-statement">
            <Card>
              <CardBody className="space-y-4">
                <p className="text-xs text-ink-muted">
                  From <DateText value={periodStart} /> to <DateText value={asOf} />.
                </p>

                <StatementSection title="Revenue" lines={incomeStatement.revenue} total={incomeStatement.totalRevenue} />
                <StatementSection title="Expense" lines={incomeStatement.expense} total={incomeStatement.totalExpense} />

                <div className="flex items-center justify-between rounded-md border border-hairline bg-surface-sunken px-3 py-2.5">
                  <span className="text-sm font-medium text-ink">Net income</span>
                  <span className={`tnum text-sm font-semibold ${incomeStatement.netIncome < 0 ? "text-danger" : "text-success"}`}>
                    <Money value={incomeStatement.netIncome} />
                  </span>
                </div>
              </CardBody>
            </Card>
          </TabsContent>

          <TabsContent value="balance-sheet">
            <Card>
              <CardBody className="space-y-4">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-ink-muted">Assets = Liabilities + Equity (including current-period net income).</p>
                  <Badge tone={balanceSheet.outOfBalance === 0 ? "success" : "danger"} dot>
                    {balanceSheet.outOfBalance === 0 ? "Balanced" : `Out of balance by ${Math.abs(balanceSheet.outOfBalance).toFixed(2)}`}
                  </Badge>
                </div>

                <StatementSection title="Assets" lines={balanceSheet.assets} total={balanceSheet.totalAssets} />
                <StatementSection title="Liabilities" lines={balanceSheet.liabilities} total={balanceSheet.totalLiabilities} />
                <StatementSection title="Equity" lines={balanceSheet.equity} total={balanceSheet.totalEquity} note="Includes current-period net income, computed on the fly — see docs/roadmap.md on why there's no formal period close yet." />
              </CardBody>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </>
  );
}

function StatementSection({
  title,
  lines,
  total,
  note,
}: {
  title: string;
  lines: { accountId: string; code: string; name: string; balance: number }[];
  total: number;
  note?: string;
}) {
  return (
    <div>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-subtle">{title}</h3>
      {lines.length === 0 ? (
        <p className="text-sm text-ink-subtle">Nothing to show.</p>
      ) : (
        <div className="space-y-1">
          {lines.map((l) => (
            <div key={l.accountId} className="flex items-center justify-between text-sm">
              <span className="text-ink-muted">
                <span className="mr-1.5 font-mono text-xs text-ink-subtle">{l.code}</span>
                {l.name}
              </span>
              <span className="tnum text-ink">
                <Money value={l.balance} />
              </span>
            </div>
          ))}
        </div>
      )}
      <div className="mt-1.5 flex items-center justify-between border-t border-hairline pt-1.5 text-sm font-medium">
        <span className="text-ink">Total {title.toLowerCase()}</span>
        <span className="tnum text-ink">
          <Money value={total} />
        </span>
      </div>
      {note ? <p className="mt-1 text-2xs text-ink-subtle">{note}</p> : null}
    </div>
  );
}
