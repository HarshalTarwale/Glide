import "server-only";

import { withTenant } from "@/lib/db/tenant-client";
import type { RequestContext } from "@/server/context";

/** The pickers the sales order form and delivery dialog need. */
export interface SalesFormOptions {
  customers: { id: string; name: string; currency: string | null }[];
  products: { id: string; sku: string; name: string; salesPrice: number; uomCode: string }[];
  warehouses: { id: string; code: string; name: string }[];
}

export async function getSalesFormOptions(ctx: RequestContext): Promise<SalesFormOptions> {
  return withTenant(ctx.tenantId, async (tx) => {
    const [customers, products, warehouses] = await Promise.all([
      tx.partner.findMany({
        where: { isCustomer: true, deletedAt: null },
        select: { id: true, name: true, currency: true },
        orderBy: { name: "asc" },
      }),
      tx.product.findMany({
        where: { isSellable: true, deletedAt: null },
        select: { id: true, sku: true, name: true, salesPrice: true, uom: { select: { code: true } } },
        orderBy: { name: "asc" },
      }),
      tx.warehouse.findMany({
        where: { isActive: true },
        select: { id: true, code: true, name: true },
        orderBy: { name: "asc" },
      }),
    ]);

    return {
      customers,
      products: products.map((p) => ({
        id: p.id,
        sku: p.sku,
        name: p.name,
        salesPrice: Number(p.salesPrice.toString()),
        uomCode: p.uom.code,
      })),
      warehouses,
    };
  });
}
