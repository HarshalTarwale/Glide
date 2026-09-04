import "server-only";

import type { TenantTransaction } from "@/lib/db/tenant-client";
import type { SystemAccountKey } from "./accounts";

/**
 * The default chart of accounts every company needs before the GL can post
 * anything -- same reasoning as bootstrap-tenant.ts's UoM/tax-category
 * seed: not demo content, required. gl-subscriber.ts's postings fail
 * loudly (caught and logged by events.ts's emit(), never blocking the
 * document that triggered them) if a company hasn't been through this.
 *
 * Deliberately generic rather than a country-specific statutory chart --
 * the same scope line as bootstrap-tenant.ts's tax rates being "starting
 * values a tenant is expected to review, not legal advice." A tenant adds
 * more accounts (Settings -> Chart of Accounts) as their books need them;
 * these eight are only the ones the system posts to automatically.
 */

const DEFAULT_ACCOUNTS: {
  code: string;
  name: string;
  type: "asset" | "liability" | "equity" | "revenue" | "expense";
  systemKey: SystemAccountKey;
}[] = [
  { code: "1000", name: "Cash and Bank", type: "asset", systemKey: "cash" },
  { code: "1100", name: "Accounts Receivable", type: "asset", systemKey: "accounts_receivable" },
  { code: "1200", name: "Inventory", type: "asset", systemKey: "inventory_asset" },
  { code: "2000", name: "Accounts Payable", type: "liability", systemKey: "accounts_payable" },
  { code: "2100", name: "Tax Payable", type: "liability", systemKey: "tax_payable" },
  { code: "3000", name: "Retained Earnings", type: "equity", systemKey: "retained_earnings" },
  { code: "4000", name: "Sales Revenue", type: "revenue", systemKey: "sales_revenue" },
  { code: "5000", name: "Cost of Goods Sold", type: "expense", systemKey: "cost_of_goods_sold" },
];

export interface AccountingBootstrapResult {
  accountCount: number;
}

/**
 * Idempotent: safe to call for a company that already has some or all of
 * these accounts (skips any systemKey already present) -- the backfill
 * script for tenants that existed before this module needs exactly that,
 * and a re-run must never error or duplicate rows.
 */
export async function bootstrapAccounting(
  tx: TenantTransaction,
  tenantId: string,
  companyId: string
): Promise<AccountingBootstrapResult> {
  const existing = await tx.ledgerAccount.findMany({
    where: { tenantId, companyId, systemKey: { not: null } },
    select: { systemKey: true },
  });
  const existingKeys = new Set(existing.map((a) => a.systemKey));

  const toCreate = DEFAULT_ACCOUNTS.filter((a) => !existingKeys.has(a.systemKey));
  if (toCreate.length > 0) {
    await tx.ledgerAccount.createMany({
      data: toCreate.map((a) => ({ tenantId, companyId, code: a.code, name: a.name, type: a.type, systemKey: a.systemKey })),
    });
  }

  return { accountCount: toCreate.length };
}
