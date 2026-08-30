import "server-only";

import { z } from "zod";
import { withTenant } from "@/lib/db/tenant-client";
import { assertPermission } from "@/lib/auth/permissions";
import type { RequestContext } from "@/server/context";

/**
 * Per-warehouse reorder thresholds. More precise than the single tenant-wide
 * Product.reorderPoint set in P1 -- a distributor with three warehouses
 * legitimately wants "reorder when Mumbai drops below 50", not one number
 * shared across every location.
 *
 * Deliberately NOT wired into getStockLevels()'s low-stock flag: that report
 * is company-wide on-hand (summed across every location, matching every
 * incumbent studied in Stage 1 research for valuation), and a per-warehouse
 * threshold doesn't have a well-defined meaning against a company-wide sum.
 * A genuinely per-warehouse low-stock report is the natural next report to
 * build once a screen needs one -- this ships the data model and CRUD now,
 * without forcing a mismatched wiring onto the existing report.
 */

export interface ReorderRuleDTO {
  id: string;
  productId: string;
  productName: string;
  productSku: string;
  warehouseId: string;
  warehouseName: string;
  minQty: number;
  maxQty: number | null;
  isActive: boolean;
}

export const reorderRuleInputSchema = z.object({
  productId: z.uuid(),
  warehouseId: z.uuid(),
  minQty: z.number().min(0),
  maxQty: z.number().min(0).nullish(),
});
export type ReorderRuleInput = z.infer<typeof reorderRuleInputSchema>;

type RuleRow = {
  id: string;
  minQty: { toString(): string };
  maxQty: { toString(): string } | null;
  isActive: boolean;
  product: { id: string; name: string; sku: string };
  warehouse: { id: string; name: string };
};

function toDTO(row: RuleRow): ReorderRuleDTO {
  return {
    id: row.id,
    productId: row.product.id,
    productName: row.product.name,
    productSku: row.product.sku,
    warehouseId: row.warehouse.id,
    warehouseName: row.warehouse.name,
    minQty: Number(row.minQty.toString()),
    maxQty: row.maxQty ? Number(row.maxQty.toString()) : null,
    isActive: row.isActive,
  };
}

const INCLUDE = {
  product: { select: { id: true, name: true, sku: true } },
  warehouse: { select: { id: true, name: true } },
} as const;

export async function listReorderRules(ctx: RequestContext): Promise<ReorderRuleDTO[]> {
  assertPermission(ctx.permissions, "inventory:warehouse:read");

  return withTenant(ctx.tenantId, async (tx) => {
    const rows = await tx.reorderRule.findMany({
      include: INCLUDE,
      orderBy: [{ product: { name: "asc" } }],
    });
    return rows.map((r) => toDTO(r as unknown as RuleRow));
  });
}

export async function createReorderRule(
  ctx: RequestContext,
  input: ReorderRuleInput
): Promise<ReorderRuleDTO> {
  assertPermission(ctx.permissions, "inventory:warehouse:write");
  const data = reorderRuleInputSchema.parse(input);

  return withTenant(ctx.tenantId, async (tx) => {
    const row = await tx.reorderRule.create({
      data: {
        tenantId: ctx.tenantId,
        productId: data.productId,
        warehouseId: data.warehouseId,
        minQty: data.minQty,
        maxQty: data.maxQty ?? null,
      },
      include: INCLUDE,
    });
    return toDTO(row as unknown as RuleRow);
  });
}

export async function updateReorderRule(
  ctx: RequestContext,
  id: string,
  input: Partial<ReorderRuleInput>
): Promise<ReorderRuleDTO> {
  assertPermission(ctx.permissions, "inventory:warehouse:write");
  const data = reorderRuleInputSchema.partial().parse(input);

  return withTenant(ctx.tenantId, async (tx) => {
    const row = await tx.reorderRule.update({
      where: { id },
      data: {
        ...(data.minQty !== undefined ? { minQty: data.minQty } : {}),
        ...(data.maxQty !== undefined ? { maxQty: data.maxQty ?? null } : {}),
      },
      include: INCLUDE,
    });
    return toDTO(row as unknown as RuleRow);
  });
}

export async function deleteReorderRule(ctx: RequestContext, id: string): Promise<void> {
  assertPermission(ctx.permissions, "inventory:warehouse:write");
  await withTenant(ctx.tenantId, (tx) => tx.reorderRule.delete({ where: { id } }));
}
