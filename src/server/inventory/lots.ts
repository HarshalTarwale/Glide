import "server-only";

import { z } from "zod";
import { withTenant } from "@/lib/db/tenant-client";
import { assertPermission } from "@/lib/auth/permissions";
import type { RequestContext } from "@/server/context";

/**
 * Read-only lot/serial visibility.
 *
 * The move ledger already tracks lots correctly -- receiveStock/deliverStock
 * in stock.ts require a lot code the moment a product's tracking mode isn't
 * "none", and StockQuant carries lotId so on-hand stays separated per lot
 * (see tests/stock-ledger.test.ts's lot test). What was missing was a way to
 * SEE which lots exist and how much of each is on hand; this closes that.
 *
 * No create/edit here on purpose: a lot is created implicitly by the first
 * move that references its code (see recordMove's upsert), not through a
 * form of its own -- there is nothing to "create" independent of a move.
 */

export interface LotDTO {
  id: string;
  code: string;
  productName: string;
  productSku: string;
  uomCode: string;
  onHand: number;
  expiresAt: string | null;
  isExpiringSoon: boolean;
}

const EXPIRY_WARNING_DAYS = 30;

export const updateLotExpirySchema = z.object({
  expiresAt: z.coerce.date().nullable(),
});
export type UpdateLotExpiryInput = z.infer<typeof updateLotExpirySchema>;

/**
 * The only mutation on a Lot: setting or clearing its expiry, for the case
 * where a receipt created the lot before the expiry was known (e.g. a
 * supplier confirms the batch date afterward). Everything else about a lot
 * -- its code, its product, its existence -- is fixed by the move that
 * first created it.
 */
export async function updateLotExpiry(
  ctx: RequestContext,
  lotId: string,
  input: UpdateLotExpiryInput
): Promise<void> {
  assertPermission(ctx.permissions, "inventory:stock:move");
  const data = updateLotExpirySchema.parse(input);

  await withTenant(ctx.tenantId, (tx) => tx.lot.update({ where: { id: lotId }, data: { expiresAt: data.expiresAt } }));
}

export async function listLots(ctx: RequestContext): Promise<LotDTO[]> {
  assertPermission(ctx.permissions, "inventory:stock:read");

  return withTenant(ctx.tenantId, async (tx) => {
    const lots = await tx.lot.findMany({
      include: {
        product: { select: { name: true, sku: true, uom: { select: { code: true } } } },
        quants: { select: { quantity: true, location: { select: { kind: true } } } },
      },
      orderBy: [{ expiresAt: "asc" }, { code: "asc" }],
    });

    const warningCutoff = new Date();
    warningCutoff.setDate(warningCutoff.getDate() + EXPIRY_WARNING_DAYS);

    return lots.map((lot) => {
      const onHand = lot.quants
        .filter((q) => q.location.kind === "internal" || q.location.kind === "transit")
        .reduce((sum, q) => sum + Number(q.quantity.toString()), 0);

      return {
        id: lot.id,
        code: lot.code,
        productName: lot.product.name,
        productSku: lot.product.sku,
        uomCode: lot.product.uom.code,
        onHand,
        expiresAt: lot.expiresAt ? lot.expiresAt.toISOString() : null,
        isExpiringSoon: Boolean(lot.expiresAt && lot.expiresAt <= warningCutoff && onHand > 0),
      };
    });
  });
}
