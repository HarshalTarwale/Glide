import "server-only";

import { withTenant } from "@/lib/db/tenant-client";
import type { RequestContext } from "@/server/context";

/** The pickers the standalone-invoice form and payment dialogs need. */
export interface InvoiceFormOptions {
  customers: { id: string; name: string; currency: string | null }[];
  products: { id: string; sku: string; name: string; salesPrice: number; uomCode: string }[];
}

export async function getInvoiceFormOptions(ctx: RequestContext): Promise<InvoiceFormOptions> {
  return withTenant(ctx.tenantId, async (tx) => {
    const [customers, products] = await Promise.all([
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
    };
  });
}

export interface InvoiceableOrderLineDTO {
  id: string;
  productName: string;
  productSku: string;
  uomCode: string;
  /** qtyOrdered or qtyDelivered depending on the order's invoicingPolicy, minus qtyInvoiced. */
  remaining: number;
  unitPrice: number;
}

/** What a sales order still has left to invoice, respecting its own invoicingPolicy. */
export async function getInvoiceableOrderLines(ctx: RequestContext, salesOrderId: string): Promise<InvoiceableOrderLineDTO[]> {
  return withTenant(ctx.tenantId, async (tx) => {
    const order = await tx.salesOrder.findUniqueOrThrow({
      where: { id: salesOrderId },
      include: { lines: { include: { product: { select: { sku: true, name: true } }, uom: { select: { code: true } } } } },
    });

    return order.lines
      .map((l) => {
        const invoiceable = order.invoicingPolicy === "invoice_ordered" ? Number(l.qtyOrdered.toString()) : Number(l.qtyDelivered.toString());
        const remaining = Math.round((invoiceable - Number(l.qtyInvoiced.toString())) * 1e6) / 1e6;
        return {
          id: l.id,
          productName: l.product.name,
          productSku: l.product.sku,
          uomCode: l.uom.code,
          remaining,
          unitPrice: Number(l.unitPrice.toString()),
        };
      })
      .filter((l) => l.remaining > 0);
  });
}
