import "server-only";

import { z } from "zod";
import { withTenant, type TenantTransaction } from "@/lib/db/tenant-client";
import { assertPermission } from "@/lib/auth/permissions";
import type { RequestContext } from "@/server/context";

/**
 * Chart of accounts. A default set is seeded per company by
 * accounting-bootstrap.ts; this module is the CRUD on top of it, plus the
 * systemKey lookup gl-subscriber.ts uses to find "the Accounts Receivable
 * account" without hardcoding an id anywhere.
 */

export type SystemAccountKey =
  | "cash"
  | "accounts_receivable"
  | "accounts_payable"
  | "inventory_asset"
  | "tax_payable"
  | "retained_earnings"
  | "sales_revenue"
  | "cost_of_goods_sold";

export interface LedgerAccountDTO {
  id: string;
  code: string;
  name: string;
  type: "asset" | "liability" | "equity" | "revenue" | "expense";
  systemKey: string | null;
  isActive: boolean;
}

export const ledgerAccountInputSchema = z.object({
  code: z.string().min(1, "Code is required").max(20),
  name: z.string().min(1, "Name is required").max(120),
  type: z.enum(["asset", "liability", "equity", "revenue", "expense"]),
  isActive: z.boolean().default(true),
});
export type LedgerAccountInput = z.infer<typeof ledgerAccountInputSchema>;

export async function listAccounts(ctx: RequestContext): Promise<LedgerAccountDTO[]> {
  assertPermission(ctx.permissions, "accounting:account:read");

  return withTenant(ctx.tenantId, async (tx) => {
    const company = await tx.company.findFirstOrThrow({ where: { tenantId: ctx.tenantId }, orderBy: { createdAt: "asc" } });
    const rows = await tx.ledgerAccount.findMany({
      where: { tenantId: ctx.tenantId, companyId: company.id },
      orderBy: { code: "asc" },
    });
    return rows.map(toDTO);
  });
}

function toDTO(row: { id: string; code: string; name: string; type: string; systemKey: string | null; isActive: boolean }): LedgerAccountDTO {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    type: row.type as LedgerAccountDTO["type"],
    systemKey: row.systemKey,
    isActive: row.isActive,
  };
}

export async function createAccount(ctx: RequestContext, input: LedgerAccountInput): Promise<string> {
  assertPermission(ctx.permissions, "accounting:account:write");
  const data = ledgerAccountInputSchema.parse(input);

  return withTenant(ctx.tenantId, async (tx) => {
    const company = await tx.company.findFirstOrThrow({ where: { tenantId: ctx.tenantId }, orderBy: { createdAt: "asc" } });
    const account = await tx.ledgerAccount.create({
      data: { tenantId: ctx.tenantId, companyId: company.id, code: data.code, name: data.name, type: data.type, isActive: data.isActive },
    });
    return account.id;
  });
}

export async function updateAccount(ctx: RequestContext, id: string, input: LedgerAccountInput): Promise<void> {
  assertPermission(ctx.permissions, "accounting:account:write");
  const data = ledgerAccountInputSchema.parse(input);

  await withTenant(ctx.tenantId, async (tx) => {
    const existing = await tx.ledgerAccount.findUniqueOrThrow({ where: { id } });
    // A system account's TYPE is load-bearing for gl-subscriber.ts's
    // postings (e.g. Accounts Receivable must stay an asset for the
    // balance sheet to mean anything) -- code and name are cosmetic and
    // stay editable, systemKey itself is never exposed to this input at all.
    if (existing.systemKey && existing.type !== data.type) {
      throw new Error(`"${existing.name}" is a system account -- its type cannot be changed.`);
    }
    await tx.ledgerAccount.update({ where: { id }, data: { code: data.code, name: data.name, type: data.type, isActive: data.isActive } });
  });
}

export async function deactivateAccount(ctx: RequestContext, id: string): Promise<void> {
  assertPermission(ctx.permissions, "accounting:account:write");

  await withTenant(ctx.tenantId, async (tx) => {
    const existing = await tx.ledgerAccount.findUniqueOrThrow({ where: { id } });
    if (existing.systemKey) {
      throw new Error(`"${existing.name}" is a system account the ledger posts to automatically -- it cannot be deactivated.`);
    }
    await tx.ledgerAccount.update({ where: { id }, data: { isActive: false } });
  });
}

/**
 * Looks up this company's system accounts by key, for gl-subscriber.ts.
 * Throws (caught and logged by events.ts's emit(), never propagated to the
 * document that triggered posting) if the company hasn't been bootstrapped
 * with a chart of accounts yet.
 */
export async function getSystemAccounts(
  tx: TenantTransaction,
  tenantId: string,
  companyId: string,
  keys: SystemAccountKey[]
): Promise<Record<string, { id: string }>> {
  const rows = await tx.ledgerAccount.findMany({ where: { tenantId, companyId, systemKey: { in: keys } } });
  const map: Record<string, { id: string }> = {};
  for (const key of keys) {
    const row = rows.find((r) => r.systemKey === key);
    if (!row) {
      throw new Error(`Missing system account "${key}" for this company. Run the accounting bootstrap for it.`);
    }
    map[key] = { id: row.id };
  }
  return map;
}
