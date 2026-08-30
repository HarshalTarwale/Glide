import "server-only";

import { withTenant } from "@/lib/db/tenant-client";
import type { RequestContext } from "@/server/context";

/**
 * The short, fixed-length lists a product/partner form picks from. Read-only,
 * no permission gate of its own -- reading it is a precondition of reaching
 * a form that IS gated (inventory:product:write), so gating twice would only
 * duplicate the check the caller already made.
 */
export interface CatalogOptions {
  units: { id: string; code: string; name: string }[];
  categories: { id: string; name: string }[];
  taxCategories: { id: string; key: string; name: string }[];
}

export async function getCatalogOptions(ctx: RequestContext): Promise<CatalogOptions> {
  return withTenant(ctx.tenantId, async (tx) => {
    const [units, categories, taxCategories] = await Promise.all([
      tx.unitOfMeasure.findMany({
        select: { id: true, code: true, name: true },
        orderBy: { code: "asc" },
      }),
      tx.productCategory.findMany({
        where: { deletedAt: null },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      }),
      tx.taxCategory.findMany({
        select: { id: true, key: true, name: true },
        orderBy: { name: "asc" },
      }),
    ]);
    return { units, categories, taxCategories };
  });
}
