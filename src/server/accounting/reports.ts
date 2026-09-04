import "server-only";

import { withTenant, type TenantTransaction } from "@/lib/db/tenant-client";
import { assertPermission } from "@/lib/auth/permissions";
import {
  buildTrialBalance,
  buildIncomeStatement,
  buildBalanceSheet,
  type AccountType,
  type TrialBalance,
  type IncomeStatement,
  type BalanceSheet,
} from "@/lib/accounting/journal";
import type { RequestContext } from "@/server/context";

/**
 * The reports that make this "the system of record" rather than a bare
 * ledger screen -- all three built on the same pure functions
 * (src/lib/accounting/journal.ts), fed real POSTED lines only (a draft
 * journal entry, by definition, hasn't happened yet and must never move a
 * reported balance).
 */

async function loadPostedLinesByAccount(
  tx: TenantTransaction,
  tenantId: string,
  companyId: string,
  opts: { from?: Date; to?: Date }
) {
  const accounts = await tx.ledgerAccount.findMany({ where: { tenantId, companyId } });

  const dateFilter: { gte?: Date; lte?: Date } = {};
  if (opts.from) dateFilter.gte = opts.from;
  if (opts.to) dateFilter.lte = opts.to;

  const lines = await tx.journalEntryLine.findMany({
    where: {
      tenantId,
      account: { companyId },
      entry: { status: "posted", ...(opts.from || opts.to ? { date: dateFilter } : {}) },
    },
    select: { accountId: true, debit: true, credit: true },
  });

  const linesByAccount = new Map<string, { debit: number; credit: number }[]>();
  for (const line of lines) {
    const list = linesByAccount.get(line.accountId) ?? [];
    list.push({ debit: Number(line.debit.toString()), credit: Number(line.credit.toString()) });
    linesByAccount.set(line.accountId, list);
  }

  return accounts.map((a) => ({
    accountId: a.id,
    code: a.code,
    name: a.name,
    type: a.type as AccountType,
    lines: linesByAccount.get(a.id) ?? [],
  }));
}

export async function getTrialBalance(ctx: RequestContext, asOf: Date = new Date()): Promise<TrialBalance> {
  assertPermission(ctx.permissions, "accounting:report:read");

  return withTenant(ctx.tenantId, async (tx) => {
    const company = await tx.company.findFirstOrThrow({ where: { tenantId: ctx.tenantId }, orderBy: { createdAt: "asc" } });
    const accounts = await loadPostedLinesByAccount(tx, ctx.tenantId, company.id, { to: asOf });
    return buildTrialBalance(accounts);
  });
}

export async function getIncomeStatement(ctx: RequestContext, from: Date, to: Date): Promise<IncomeStatement> {
  assertPermission(ctx.permissions, "accounting:report:read");

  return withTenant(ctx.tenantId, async (tx) => {
    const company = await tx.company.findFirstOrThrow({ where: { tenantId: ctx.tenantId }, orderBy: { createdAt: "asc" } });
    const accounts = await loadPostedLinesByAccount(tx, ctx.tenantId, company.id, { from, to });
    return buildIncomeStatement(accounts);
  });
}

/**
 * `fiscalYearStart` anchors what "current period" means for the implicit
 * net-income line -- see journal.ts's buildBalanceSheet doc comment on why
 * there's no formal period close. Defaults to January 1st of asOf's year;
 * a real fiscal-year setting on Company/Tenant is a natural v2 addition,
 * not built here.
 */
export async function getBalanceSheet(ctx: RequestContext, asOf: Date = new Date()): Promise<BalanceSheet> {
  assertPermission(ctx.permissions, "accounting:report:read");

  return withTenant(ctx.tenantId, async (tx) => {
    const company = await tx.company.findFirstOrThrow({ where: { tenantId: ctx.tenantId }, orderBy: { createdAt: "asc" } });
    const fiscalYearStart = new Date(Date.UTC(asOf.getUTCFullYear(), 0, 1));

    const [balanceSheetAccounts, periodAccounts] = await Promise.all([
      loadPostedLinesByAccount(tx, ctx.tenantId, company.id, { to: asOf }),
      loadPostedLinesByAccount(tx, ctx.tenantId, company.id, { from: fiscalYearStart, to: asOf }),
    ]);

    const netIncome = buildIncomeStatement(periodAccounts).netIncome;
    return buildBalanceSheet(balanceSheetAccounts, netIncome);
  });
}
