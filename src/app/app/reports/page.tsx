import { requireContext } from "@/server/context";
import { getTrialBalance, getIncomeStatement, getBalanceSheet } from "@/server/accounting/reports";
import { ReportsView } from "./reports-view";

export const metadata = { title: "Reports" };

export default async function ReportsPage() {
  const ctx = await requireContext();
  const now = new Date();
  const yearStart = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));

  const [trialBalance, incomeStatement, balanceSheet] = await Promise.all([
    getTrialBalance(ctx, now),
    getIncomeStatement(ctx, yearStart, now),
    getBalanceSheet(ctx, now),
  ]);

  return (
    <ReportsView
      trialBalance={trialBalance}
      incomeStatement={incomeStatement}
      balanceSheet={balanceSheet}
      asOf={now.toISOString()}
      periodStart={yearStart.toISOString()}
    />
  );
}
