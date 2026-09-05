import "server-only";

import { z } from "zod";
import { withTenant, type TenantTransaction } from "@/lib/db/tenant-client";
import { assertPermission } from "@/lib/auth/permissions";
import type { RequestContext } from "@/server/context";

/**
 * Bill of Materials. A plain list, same treatment as Chart of Accounts and
 * Leave Types -- small in number, edited rarely, no need for a paginated
 * DataTable.
 */

export interface BomLineDTO {
  id: string;
  componentProductId: string;
  componentName: string;
  componentSku: string;
  quantity: number;
}

export interface BomDTO {
  id: string;
  productId: string;
  productName: string;
  productSku: string;
  quantity: number;
  isActive: boolean;
  notes: string | null;
  lines: BomLineDTO[];
}

const bomLineInputSchema = z.object({
  componentProductId: z.uuid(),
  quantity: z.number().positive("Quantity must be greater than zero"),
});

export const bomInputSchema = z.object({
  productId: z.uuid(),
  quantity: z.number().positive("Quantity must be greater than zero").default(1),
  isActive: z.boolean().default(true),
  notes: z.string().max(2000).nullish(),
  lines: z.array(bomLineInputSchema).min(1, "A BOM needs at least one component"),
});
export type BomInput = z.infer<typeof bomInputSchema>;

async function assertUntracked(tx: TenantTransaction, productId: string, role: "output" | "component"): Promise<{ name: string }> {
  const product = await tx.product.findUniqueOrThrow({ where: { id: productId } });
  if (product.type !== "goods") {
    throw new Error(`"${product.name}" is a service, not a stock-tracked product, so it cannot be a BOM ${role}.`);
  }
  if (product.tracking !== "none") {
    throw new Error(`"${product.name}" is lot/serial-tracked -- manufacturing does not support tracked ${role}s yet.`);
  }
  return { name: product.name };
}

function toDTO(bom: {
  id: string;
  productId: string;
  product: { name: string; sku: string };
  quantity: { toString(): string };
  isActive: boolean;
  notes: string | null;
  lines: { id: string; componentProductId: string; component: { name: string; sku: string }; quantity: { toString(): string } }[];
}): BomDTO {
  return {
    id: bom.id,
    productId: bom.productId,
    productName: bom.product.name,
    productSku: bom.product.sku,
    quantity: Number(bom.quantity.toString()),
    isActive: bom.isActive,
    notes: bom.notes,
    lines: bom.lines.map((l) => ({
      id: l.id,
      componentProductId: l.componentProductId,
      componentName: l.component.name,
      componentSku: l.component.sku,
      quantity: Number(l.quantity.toString()),
    })),
  };
}

export async function listBoms(ctx: RequestContext): Promise<BomDTO[]> {
  assertPermission(ctx.permissions, "manufacturing:bom:read");

  return withTenant(ctx.tenantId, async (tx) => {
    const rows = await tx.billOfMaterial.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: "desc" },
      include: { product: { select: { name: true, sku: true } }, lines: { include: { component: { select: { name: true, sku: true } } }, orderBy: { sortOrder: "asc" } } },
    });
    return rows.map(toDTO);
  });
}

export async function getBom(ctx: RequestContext, id: string): Promise<BomDTO | null> {
  assertPermission(ctx.permissions, "manufacturing:bom:read");

  return withTenant(ctx.tenantId, async (tx) => {
    const row = await tx.billOfMaterial.findUnique({
      where: { id },
      include: { product: { select: { name: true, sku: true } }, lines: { include: { component: { select: { name: true, sku: true } } }, orderBy: { sortOrder: "asc" } } },
    });
    return row ? toDTO(row) : null;
  });
}

export async function createBom(ctx: RequestContext, input: BomInput): Promise<string> {
  assertPermission(ctx.permissions, "manufacturing:bom:write");
  const data = bomInputSchema.parse(input);

  return withTenant(ctx.tenantId, async (tx) => {
    await assertUntracked(tx, data.productId, "output");
    if (data.lines.some((l) => l.componentProductId === data.productId)) {
      throw new Error("A product cannot be a component of its own BOM.");
    }
    for (const line of data.lines) {
      await assertUntracked(tx, line.componentProductId, "component");
    }

    const company = await tx.company.findFirstOrThrow({ where: { tenantId: ctx.tenantId }, orderBy: { createdAt: "asc" } });

    const bom = await tx.billOfMaterial.create({
      data: {
        tenantId: ctx.tenantId,
        companyId: company.id,
        productId: data.productId,
        quantity: data.quantity,
        isActive: data.isActive,
        notes: data.notes || null,
        createdBy: ctx.userId,
        updatedBy: ctx.userId,
        lines: {
          create: data.lines.map((l, i) => ({
            tenantId: ctx.tenantId,
            componentProductId: l.componentProductId,
            quantity: l.quantity,
            sortOrder: i,
          })),
        },
      },
    });

    return bom.id;
  });
}

export async function updateBom(ctx: RequestContext, id: string, input: BomInput): Promise<void> {
  assertPermission(ctx.permissions, "manufacturing:bom:write");
  const data = bomInputSchema.parse(input);

  await withTenant(ctx.tenantId, async (tx) => {
    await assertUntracked(tx, data.productId, "output");
    if (data.lines.some((l) => l.componentProductId === data.productId)) {
      throw new Error("A product cannot be a component of its own BOM.");
    }
    for (const line of data.lines) {
      await assertUntracked(tx, line.componentProductId, "component");
    }

    await tx.bomLine.deleteMany({ where: { bomId: id } });
    await tx.billOfMaterial.update({
      where: { id },
      data: {
        productId: data.productId,
        quantity: data.quantity,
        isActive: data.isActive,
        notes: data.notes || null,
        updatedBy: ctx.userId,
        lines: {
          create: data.lines.map((l, i) => ({
            tenantId: ctx.tenantId,
            componentProductId: l.componentProductId,
            quantity: l.quantity,
            sortOrder: i,
          })),
        },
      },
    });
  });
}

export async function deactivateBom(ctx: RequestContext, id: string): Promise<void> {
  assertPermission(ctx.permissions, "manufacturing:bom:write");

  await withTenant(ctx.tenantId, async (tx) => {
    await tx.billOfMaterial.update({ where: { id }, data: { isActive: false, updatedBy: ctx.userId } });
  });
}
