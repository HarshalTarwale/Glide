import "server-only";

import { withTenant } from "@/lib/db/tenant-client";
import type { RequestContext } from "@/server/context";

/** The pickers a stock-move form (and reorder-rule form) needs. */
export interface StockFormOptions {
  products: { id: string; sku: string; name: string; tracking: string; uomCode: string }[];
  locations: { id: string; code: string; name: string; warehouseName: string | null }[];
  /** Real Warehouse ids -- distinct from locations[].id, which are Location
   *  ids. A reorder rule's warehouseId FK must reference this list, not a
   *  location, or the write fails on a bad foreign key. */
  warehouses: { id: string; code: string; name: string }[];
}

export async function getStockFormOptions(ctx: RequestContext): Promise<StockFormOptions> {
  return withTenant(ctx.tenantId, async (tx) => {
    const [products, locations, warehouses] = await Promise.all([
      tx.product.findMany({
        where: { type: "goods", deletedAt: null, isActive: true },
        select: { id: true, sku: true, name: true, tracking: true, uom: { select: { code: true } } },
        orderBy: { name: "asc" },
      }),
      tx.location.findMany({
        where: { kind: "internal" },
        select: { id: true, code: true, name: true, warehouse: { select: { name: true } } },
        orderBy: { code: "asc" },
      }),
      tx.warehouse.findMany({
        where: { isActive: true },
        select: { id: true, code: true, name: true },
        orderBy: { name: "asc" },
      }),
    ]);

    return {
      products: products.map((p) => ({ id: p.id, sku: p.sku, name: p.name, tracking: p.tracking, uomCode: p.uom.code })),
      locations: locations.map((l) => ({ id: l.id, code: l.code, name: l.name, warehouseName: l.warehouse?.name ?? null })),
      warehouses,
    };
  });
}
