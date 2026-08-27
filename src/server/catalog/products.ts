import "server-only";

import { z } from "zod";
import { withTenant } from "@/lib/db/tenant-client";
import { assertPermission } from "@/lib/auth/permissions";
import { compileQuery } from "@/lib/query/prisma-query";
import type { RecordPage, RecordQuery } from "@/lib/query/record-query";
import type { RequestContext } from "@/server/context";

/**
 * Product service — the DAL for the catalog.
 *
 * Every function follows the standard shape from docs/architecture.md §3.4:
 *   assertPermission -> validate -> tenant-scoped transaction -> mutate
 *   -> audit log -> return a DTO
 *
 * Nothing here writes `where: { tenantId }`. It cannot leak across tenants
 * because Postgres RLS refuses, not because this code remembered to ask.
 */

/** What leaves the server. Never the raw Prisma row. */
export interface ProductDTO {
  id: string;
  sku: string;
  name: string;
  type: "goods" | "service";
  categoryName: string | null;
  uomCode: string;
  salesPrice: number;
  /** Layer 4 (field visibility): omitted for roles without cost access. */
  costPrice: number | null;
  taxCategoryKey: string | null;
  hsnCode: string | null;
  tracking: "none" | "lot" | "serial";
  isActive: boolean;
  isSellable: boolean;
}

const SEARCH_FIELDS = ["name", "sku", "barcode"];
const ALLOWED_FIELDS = [
  "sku",
  "name",
  "type",
  "isActive",
  "isSellable",
  "salesPrice",
  "tracking",
  "hsnCode",
  "category.name",
];

export const productInputSchema = z.object({
  sku: z.string().min(1, "SKU is required").max(64),
  name: z.string().min(1, "Name is required").max(200),
  type: z.enum(["goods", "service"]).default("goods"),
  categoryId: z.uuid().nullish(),
  uomId: z.uuid(),
  salesPrice: z.number().min(0).default(0),
  costPrice: z.number().min(0).default(0),
  taxCategoryId: z.uuid().nullish(),
  hsnCode: z.string().max(16).nullish(),
  tracking: z.enum(["none", "lot", "serial"]).default("none"),
  isSellable: z.boolean().default(true),
  isPurchasable: z.boolean().default(true),
  isActive: z.boolean().default(true),
});

export type ProductInput = z.infer<typeof productInputSchema>;

/**
 * Layer 4 of the permission model: cost price is hidden from roles without
 * it, in the SERIALIZER. A component that simply omitted the column would be
 * decoration — the value would still be in the payload.
 */
function canSeeCost(ctx: RequestContext) {
  return ctx.permissions.has("inventory:product:write") || ctx.isOwner;
}

type ProductRow = {
  id: string;
  sku: string;
  name: string;
  type: string;
  uom: { code: string };
  category: { name: string } | null;
  taxCategory: { key: string } | null;
  salesPrice: { toString(): string };
  costPrice: { toString(): string };
  hsnCode: string | null;
  tracking: string;
  isActive: boolean;
  isSellable: boolean;
};

function toDTO(row: ProductRow, ctx: RequestContext): ProductDTO {
  return {
    id: row.id,
    sku: row.sku,
    name: row.name,
    type: row.type as ProductDTO["type"],
    categoryName: row.category?.name ?? null,
    uomCode: row.uom.code,
    // Prisma Decimal -> number at the boundary only. Arithmetic stays in
    // Decimal/NUMERIC; this is for display.
    salesPrice: Number(row.salesPrice.toString()),
    costPrice: canSeeCost(ctx) ? Number(row.costPrice.toString()) : null,
    taxCategoryKey: row.taxCategory?.key ?? null,
    hsnCode: row.hsnCode,
    tracking: row.tracking as ProductDTO["tracking"],
    isActive: row.isActive,
    isSellable: row.isSellable,
  };
}

const INCLUDE = {
  category: { select: { name: true } },
  uom: { select: { code: true } },
  taxCategory: { select: { key: true } },
} as const;

export async function listProducts(
  ctx: RequestContext,
  query: RecordQuery
): Promise<RecordPage<ProductDTO>> {
  assertPermission(ctx.permissions, "inventory:product:read");

  const compiled = compileQuery(query, {
    searchFields: SEARCH_FIELDS,
    allowedFields: ALLOWED_FIELDS,
    scope: { deletedAt: null },
  });

  return withTenant(ctx.tenantId, async (tx) => {
    const [rows, total] = await Promise.all([
      tx.product.findMany({
        where: compiled.where,
        orderBy: compiled.orderBy,
        skip: compiled.skip,
        take: compiled.take,
        include: INCLUDE,
      }),
      tx.product.count({ where: compiled.where }),
    ]);

    return {
      rows: rows.map((r) => toDTO(r as unknown as ProductRow, ctx)),
      total,
      page: query.page,
      pageSize: compiled.take,
    };
  });
}

export async function getProduct(
  ctx: RequestContext,
  id: string
): Promise<ProductDTO | null> {
  assertPermission(ctx.permissions, "inventory:product:read");

  return withTenant(ctx.tenantId, async (tx) => {
    const row = await tx.product.findUnique({ where: { id }, include: INCLUDE });
    return row ? toDTO(row as unknown as ProductRow, ctx) : null;
  });
}

export async function createProduct(
  ctx: RequestContext,
  input: ProductInput
): Promise<ProductDTO> {
  assertPermission(ctx.permissions, "inventory:product:write");
  const data = productInputSchema.parse(input);

  return withTenant(ctx.tenantId, async (tx) => {
    const row = await tx.product.create({
      data: {
        ...data,
        tenantId: ctx.tenantId,
        createdBy: ctx.userId,
        updatedBy: ctx.userId,
      },
      include: INCLUDE,
    });

    await tx.auditLog.create({
      data: {
        tenantId: ctx.tenantId,
        entityType: "Product",
        entityId: row.id,
        action: "created",
        actorId: ctx.userId,
        actorName: ctx.userName,
        changes: { sku: { from: null, to: data.sku }, name: { from: null, to: data.name } },
      },
    });

    return toDTO(row as unknown as ProductRow, ctx);
  });
}

export async function updateProduct(
  ctx: RequestContext,
  id: string,
  input: Partial<ProductInput>
): Promise<ProductDTO> {
  assertPermission(ctx.permissions, "inventory:product:write");
  const data = productInputSchema.partial().parse(input);

  return withTenant(ctx.tenantId, async (tx) => {
    const before = await tx.product.findUniqueOrThrow({ where: { id } });

    const row = await tx.product.update({
      where: { id },
      data: { ...data, updatedBy: ctx.userId },
      include: INCLUDE,
    });

    // Record only what actually changed, so the audit trail stays readable.
    // Values are normalised to strings: the column is JSONB, and Decimal and
    // Date do not round-trip through JSON faithfully.
    const changes: Record<string, { from: string | null; to: string | null }> = {};
    const asText = (v: unknown) => (v === null || v === undefined ? null : String(v));

    for (const [key, value] of Object.entries(data)) {
      const previous = (before as unknown as Record<string, unknown>)[key];
      if (asText(previous) !== asText(value)) {
        changes[key] = { from: asText(previous), to: asText(value) };
      }
    }

    if (Object.keys(changes).length > 0) {
      await tx.auditLog.create({
        data: {
          tenantId: ctx.tenantId,
          entityType: "Product",
          entityId: id,
          action: "updated",
          actorId: ctx.userId,
          actorName: ctx.userName,
          changes,
        },
      });
    }

    return toDTO(row as unknown as ProductRow, ctx);
  });
}

/**
 * Soft delete. A product referenced by historical stock moves or invoice
 * lines must remain resolvable forever, so rows are never physically removed.
 */
export async function archiveProduct(ctx: RequestContext, id: string): Promise<void> {
  assertPermission(ctx.permissions, "inventory:product:write");

  await withTenant(ctx.tenantId, async (tx) => {
    await tx.product.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false, updatedBy: ctx.userId },
    });
    await tx.auditLog.create({
      data: {
        tenantId: ctx.tenantId,
        entityType: "Product",
        entityId: id,
        action: "archived",
        actorId: ctx.userId,
        actorName: ctx.userName,
      },
    });
  });
}
