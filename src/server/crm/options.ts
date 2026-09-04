import "server-only";

import { withTenant } from "@/lib/db/tenant-client";
import type { RequestContext } from "@/server/context";

export interface CrmFormOptions {
  partners: { id: string; name: string; currency: string | null }[];
}

export async function getCrmFormOptions(ctx: RequestContext): Promise<CrmFormOptions> {
  return withTenant(ctx.tenantId, async (tx) => {
    const partners = await tx.partner.findMany({
      where: { deletedAt: null },
      select: { id: true, name: true, currency: true },
      orderBy: { name: "asc" },
    });
    return { partners };
  });
}
