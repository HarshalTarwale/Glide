import "server-only";

import { z } from "zod";
import { withTenant } from "@/lib/db/tenant-client";
import { assertPermission } from "@/lib/auth/permissions";
import type { RequestContext } from "@/server/context";

/**
 * Tax rate management. bootstrap-tenant.ts seeds sensible statutory
 * defaults for IN/GB/AE/DE, but deliberately seeds NOTHING for US -- see
 * docs/architecture.md §4.2: American sales tax is a per-jurisdiction stack
 * (state + county + city) with no single national default, so a US tenant
 * configures their own. Until this file existed, "manually configured"
 * meant "edit the database directly" -- a real gap, not a documented
 * scope line. This is what makes that promise a usable capability.
 */

export interface TaxRateDTO {
  id: string;
  name: string;
  country: string;
  region: string | null;
  rate: number;
  level: string;
  categoryKey: string | null;
  categoryName: string | null;
  isActive: boolean;
}

export const taxRateInputSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  country: z.string().length(2),
  region: z.string().max(100).nullish(),
  rate: z.number().min(0).max(100),
  level: z.enum(["national", "state", "county", "city"]).default("national"),
  taxCategoryId: z.uuid().nullish(),
  isActive: z.boolean().default(true),
});
export type TaxRateInput = z.infer<typeof taxRateInputSchema>;

type RateRow = {
  id: string;
  name: string;
  country: string;
  region: string | null;
  rate: { toString(): string };
  level: string;
  isActive: boolean;
  taxCategory: { key: string; name: string } | null;
};

function toDTO(row: RateRow): TaxRateDTO {
  return {
    id: row.id,
    name: row.name,
    country: row.country,
    region: row.region,
    rate: Number(row.rate.toString()),
    level: row.level,
    categoryKey: row.taxCategory?.key ?? null,
    categoryName: row.taxCategory?.name ?? null,
    isActive: row.isActive,
  };
}

const INCLUDE = { taxCategory: { select: { key: true, name: true } } } as const;

export async function listTaxRates(ctx: RequestContext): Promise<TaxRateDTO[]> {
  assertPermission(ctx.permissions, "core:settings:read");

  return withTenant(ctx.tenantId, async (tx) => {
    const rows = await tx.taxRate.findMany({
      include: INCLUDE,
      orderBy: [{ country: "asc" }, { level: "asc" }, { name: "asc" }],
    });
    return rows.map((r) => toDTO(r as unknown as RateRow));
  });
}

export async function createTaxRate(ctx: RequestContext, input: TaxRateInput): Promise<TaxRateDTO> {
  assertPermission(ctx.permissions, "core:settings:write");
  const data = taxRateInputSchema.parse(input);

  return withTenant(ctx.tenantId, async (tx) => {
    const row = await tx.taxRate.create({
      data: {
        tenantId: ctx.tenantId,
        name: data.name,
        country: data.country,
        region: data.region || null,
        rate: data.rate,
        level: data.level,
        taxCategoryId: data.taxCategoryId || null,
        isActive: data.isActive,
      },
      include: INCLUDE,
    });
    return toDTO(row as unknown as RateRow);
  });
}

export async function updateTaxRate(
  ctx: RequestContext,
  id: string,
  input: Partial<TaxRateInput>
): Promise<TaxRateDTO> {
  assertPermission(ctx.permissions, "core:settings:write");
  const data = taxRateInputSchema.partial().parse(input);

  return withTenant(ctx.tenantId, async (tx) => {
    const row = await tx.taxRate.update({
      where: { id },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.country !== undefined ? { country: data.country } : {}),
        ...(data.region !== undefined ? { region: data.region || null } : {}),
        ...(data.rate !== undefined ? { rate: data.rate } : {}),
        ...(data.level !== undefined ? { level: data.level } : {}),
        ...(data.taxCategoryId !== undefined ? { taxCategoryId: data.taxCategoryId || null } : {}),
        ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
      },
      include: INCLUDE,
    });
    return toDTO(row as unknown as RateRow);
  });
}

export async function deleteTaxRate(ctx: RequestContext, id: string): Promise<void> {
  assertPermission(ctx.permissions, "core:settings:write");
  await withTenant(ctx.tenantId, (tx) => tx.taxRate.delete({ where: { id } }));
}
