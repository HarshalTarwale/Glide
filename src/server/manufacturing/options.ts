import "server-only";

import { withTenant } from "@/lib/db/tenant-client";
import type { RequestContext } from "@/server/context";

export interface ManufacturingFormOptions {
  /** Untracked goods only -- see manufacturing.prisma's scope note on lot/serial tracking. */
  products: { id: string; name: string; sku: string }[];
  warehouses: { id: string; name: string }[];
  boms: { id: string; productId: string; productName: string }[];
}

export async function getManufacturingFormOptions(ctx: RequestContext): Promise<ManufacturingFormOptions> {
  return withTenant(ctx.tenantId, async (tx) => {
    const [products, warehouses, boms] = await Promise.all([
      tx.product.findMany({
        where: { deletedAt: null, isActive: true, type: "goods", tracking: "none" },
        select: { id: true, name: true, sku: true },
        orderBy: { name: "asc" },
      }),
      tx.warehouse.findMany({ where: { isActive: true, deletedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
      tx.billOfMaterial.findMany({
        where: { deletedAt: null, isActive: true },
        select: { id: true, productId: true, product: { select: { name: true } } },
        orderBy: { createdAt: "desc" },
      }),
    ]);
    return { products, warehouses, boms: boms.map((b) => ({ id: b.id, productId: b.productId, productName: b.product.name })) };
  });
}
