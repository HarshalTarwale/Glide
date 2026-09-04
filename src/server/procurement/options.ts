import "server-only";

import { withTenant } from "@/lib/db/tenant-client";
import type { RequestContext } from "@/server/context";

/** The pickers the purchase-order form, bill forms, and receipt dialog need. */
export interface ProcurementFormOptions {
  suppliers: { id: string; name: string; currency: string | null }[];
  products: { id: string; sku: string; name: string; costPrice: number; uomCode: string }[];
  warehouses: { id: string; code: string; name: string }[];
}

export async function getProcurementFormOptions(ctx: RequestContext): Promise<ProcurementFormOptions> {
  return withTenant(ctx.tenantId, async (tx) => {
    const [suppliers, products, warehouses] = await Promise.all([
      tx.partner.findMany({ where: { isSupplier: true, deletedAt: null }, select: { id: true, name: true, currency: true }, orderBy: { name: "asc" } }),
      tx.product.findMany({
        where: { isPurchasable: true, deletedAt: null },
        select: { id: true, sku: true, name: true, costPrice: true, uom: { select: { code: true } } },
        orderBy: { name: "asc" },
      }),
      tx.warehouse.findMany({ where: { isActive: true }, select: { id: true, code: true, name: true }, orderBy: { name: "asc" } }),
    ]);

    return {
      suppliers,
      products: products.map((p) => ({ id: p.id, sku: p.sku, name: p.name, costPrice: Number(p.costPrice.toString()), uomCode: p.uom.code })),
      warehouses,
    };
  });
}

export interface BillableOrderLineDTO {
  id: string;
  productName: string;
  productSku: string;
  uomCode: string;
  /** qtyOrdered or qtyReceived depending on the order's billingPolicy, minus qtyBilled. */
  remaining: number;
  unitCost: number;
}

export async function getBillableOrderLines(ctx: RequestContext, purchaseOrderId: string): Promise<BillableOrderLineDTO[]> {
  return withTenant(ctx.tenantId, async (tx) => {
    const order = await tx.purchaseOrder.findUniqueOrThrow({
      where: { id: purchaseOrderId },
      include: { lines: { include: { product: { select: { sku: true, name: true } }, uom: { select: { code: true } } } } },
    });

    return order.lines
      .map((l) => {
        const billable = order.billingPolicy === "bill_ordered" ? Number(l.qtyOrdered.toString()) : Number(l.qtyReceived.toString());
        const remaining = Math.round((billable - Number(l.qtyBilled.toString())) * 1e6) / 1e6;
        return { id: l.id, productName: l.product.name, productSku: l.product.sku, uomCode: l.uom.code, remaining, unitCost: Number(l.unitCost.toString()) };
      })
      .filter((l) => l.remaining > 0);
  });
}
