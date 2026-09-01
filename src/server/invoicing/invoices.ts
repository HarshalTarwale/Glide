import "server-only";

import { z } from "zod";
import { withTenant, type TenantTransaction } from "@/lib/db/tenant-client";
import { assertPermission, recordScopeWhere } from "@/lib/auth/permissions";
import { compileQuery } from "@/lib/query/prisma-query";
import type { RecordPage, RecordQuery } from "@/lib/query/record-query";
import { computeTax } from "@/lib/tax";
import type { TaxParty, TaxableLine, JurisdictionRate } from "@/lib/tax";
import {
  deriveInvoiceStatus,
  computeInvoiceLineSubtotal,
  type InvoiceStatus,
} from "@/lib/invoicing/invoice-status";
import { deriveStatus as deriveOrderStatus } from "@/lib/sales/order-status";
import { nextDocumentNumber } from "@/server/core/numbering";
import { emit } from "@/server/core/events";
import type { RequestContext } from "@/server/context";

/**
 * Invoice service. The document graph continues one step past Sales:
 * Invoice -> InvoiceLine, with header totals cached and recomputed exactly
 * like SalesOrder (see recomputeInvoice below), and status DERIVED from
 * amountPaid via src/lib/invoicing/invoice-status.ts.
 *
 * THE non-negotiable rule for this module, per docs/architecture.md §5.5 and
 * the master plan: a posted invoice is immutable. There is no "edit a
 * posted invoice" code path here -- postInvoice() is a one-way transition,
 * and every mutation function below asserts `status === "draft"` before
 * touching a line. A correction is a new CreditNote (credit-notes.ts), the
 * same way a stock correction is a new StockMove rather than an edit to an
 * old one (P2's stock.ts).
 */

/* ------------------------------------------------------------------ */
/* DTOs                                                                 */
/* ------------------------------------------------------------------ */

export interface InvoiceLineDTO {
  id: string;
  sequence: number;
  productId: string;
  productSku: string;
  productName: string;
  description: string;
  uomCode: string;
  quantity: number;
  unitPrice: number;
  discountPct: number;
  taxLabel: string;
  taxAmount: number;
  subtotal: number;
  total: number;
  salesOrderLineId: string | null;
}

export interface InvoiceDTO {
  id: string;
  number: string;
  status: InvoiceStatus;
  partnerId: string;
  partnerName: string;
  currency: string;
  salesOrderId: string | null;
  salesOrderNumber: string | null;
  invoiceDate: string;
  dueDate: string | null;
  postedAt: string | null;
  subtotal: number;
  taxTotal: number;
  total: number;
  amountPaid: number;
  outstanding: number;
  notes: string | null;
  taxComponents: { label: string; rate: number; amount: number }[];
  lines: InvoiceLineDTO[];
}

export interface InvoiceListItemDTO {
  id: string;
  number: string;
  status: InvoiceStatus;
  partnerName: string;
  invoiceDate: string;
  dueDate: string | null;
  total: number;
  amountPaid: number;
  outstanding: number;
}

const SEARCH_FIELDS = ["number", "partner.name"];
const ALLOWED_FIELDS = ["number", "status", "invoiceDate", "dueDate", "total", "partner.name"];

/* ------------------------------------------------------------------ */
/* Input contracts                                                     */
/* ------------------------------------------------------------------ */

const invoiceLineInputSchema = z.object({
  productId: z.uuid(),
  quantity: z.number().positive(),
  unitPrice: z.number().min(0).optional(),
  discountPct: z.number().min(0).max(100).default(0),
  /** Only set when this line was drawn from a sales order. */
  salesOrderLineId: z.uuid().nullish(),
});

export const createStandaloneInvoiceInputSchema = z.object({
  partnerId: z.uuid(),
  dueDate: z.coerce.date().nullish(),
  notes: z.string().max(2000).nullish(),
  lines: z.array(invoiceLineInputSchema).min(1, "Add at least one line"),
});
export type CreateStandaloneInvoiceInput = z.infer<typeof createStandaloneInvoiceInputSchema>;

/** Which order lines to draw from, and how much of each to invoice now. */
export const createInvoiceFromOrderInputSchema = z.object({
  dueDate: z.coerce.date().nullish(),
  notes: z.string().max(2000).nullish(),
  lines: z.array(z.object({ salesOrderLineId: z.uuid(), quantity: z.number().positive() })).min(1),
});
export type CreateInvoiceFromOrderInput = z.infer<typeof createInvoiceFromOrderInputSchema>;

/* ------------------------------------------------------------------ */
/* Tax resolution — same pattern as sales/orders.ts, independent copy  */
/* so a change to one document's tax wiring can never silently reshape */
/* the other.                                                          */
/* ------------------------------------------------------------------ */

async function resolveSellerParty(tx: TenantTransaction, companyId: string): Promise<TaxParty> {
  const company = await tx.company.findUniqueOrThrow({ where: { id: companyId } });
  return {
    address: { country: company.country, region: company.region ?? undefined, city: company.city ?? undefined },
    taxId: company.taxId ?? undefined,
    isRegistered: Boolean(company.taxId),
  };
}

async function resolveBuyerParty(tx: TenantTransaction, partnerId: string): Promise<TaxParty> {
  const [address, taxInfo] = await Promise.all([
    tx.partnerAddress.findFirst({ where: { partnerId, kind: "billing" }, orderBy: { isDefault: "desc" } }),
    tx.partnerTaxInfo.findFirst({ where: { partnerId }, orderBy: { createdAt: "asc" } }),
  ]);
  return {
    address: { country: address?.country ?? "IN", region: address?.region ?? undefined, city: address?.city ?? undefined },
    taxId: taxInfo?.taxId,
    isRegistered: taxInfo?.isRegistered ?? false,
  };
}

/** See sales/orders.ts's identical helper for why this is required, not optional. */
async function resolveConfiguredRates(tx: TenantTransaction, tenantId: string): Promise<JurisdictionRate[]> {
  const rows = await tx.taxRate.findMany({
    where: { tenantId, isActive: true },
    include: { taxCategory: { select: { key: true } } },
  });
  return rows.map((r) => ({
    name: r.name,
    rate: Number(r.rate.toString()),
    level: r.level as JurisdictionRate["level"],
    region: r.region ?? undefined,
    category: (r.taxCategory?.key as JurisdictionRate["category"]) ?? undefined,
  }));
}

async function resolveUnitPrice(tx: TenantTransaction, productId: string): Promise<number> {
  const product = await tx.product.findUniqueOrThrow({ where: { id: productId }, select: { salesPrice: true } });
  return Number(product.salesPrice.toString());
}

/**
 * Computes the per-jurisdiction tax breakdown from the CURRENT tax engine
 * and settings. Used two ways: live, by getInvoice() for a draft whose
 * lines can still change; and once, by postInvoice(), to freeze the result
 * into Invoice.taxBreakdown at the exact moment it becomes a fact rather
 * than a preview.
 */
async function computeLiveTaxComponents(
  tx: TenantTransaction,
  tenantId: string,
  companyId: string,
  partnerId: string,
  lines: { id: string; subtotal: { toString(): string }; taxCategory: { key: string } | null }[]
): Promise<{ label: string; rate: number; amount: number }[]> {
  const [seller, buyer] = await Promise.all([resolveSellerParty(tx, companyId), resolveBuyerParty(tx, partnerId)]);
  const taxableLines: TaxableLine[] = lines.map((l) => ({
    id: l.id,
    amount: Number(l.subtotal.toString()),
    category: (l.taxCategory?.key as TaxableLine["category"]) ?? "standard",
  }));
  const configuredRates = await resolveConfiguredRates(tx, tenantId);
  const taxResult = computeTax({ lines: taxableLines, seller, buyer, settings: { rates: configuredRates } });
  return taxResult.components.map((c) => ({ label: c.label, rate: c.rate, amount: c.amount }));
}

/* ------------------------------------------------------------------ */
/* Recompute: totals only. Status is recomputed separately (see        */
/* recomputeStatus) since payment allocation touches it independently   */
/* of line edits, and a posted invoice's lines never change again.     */
/* ------------------------------------------------------------------ */

async function recomputeInvoice(tx: TenantTransaction, tenantId: string, invoiceId: string) {
  // taxCategory included (one JOIN) rather than looked up per line in the
  // loop below -- see the identical fix and comment in sales/orders.ts's
  // recomputeOrder, part of the P5 index/N+1 pass.
  const invoice = await tx.invoice.findUniqueOrThrow({
    where: { id: invoiceId },
    include: { lines: { include: { taxCategory: { select: { key: true } } } } },
  });
  const [seller, buyer] = await Promise.all([
    resolveSellerParty(tx, invoice.companyId),
    resolveBuyerParty(tx, invoice.partnerId),
  ]);

  const lineSubtotals = new Map<string, number>();
  const taxableLines: TaxableLine[] = [];
  for (const line of invoice.lines) {
    const subtotal = computeInvoiceLineSubtotal({
      quantity: Number(line.quantity.toString()),
      unitPrice: Number(line.unitPrice.toString()),
      discountPct: Number(line.discountPct.toString()),
      taxRate: 0,
    });
    lineSubtotals.set(line.id, subtotal);

    const category = line.taxCategory?.key ?? "standard";
    taxableLines.push({ id: line.id, amount: subtotal, category: category as TaxableLine["category"] });
  }

  // Tax computed ONCE across every line, then allocated back proportionally
  // by subtotal share -- identical discipline to sales/orders.ts's
  // recomputeOrder, and for the same reason: so line.taxAmount always sums
  // to invoice.taxTotal exactly, with no second rounding pass to disagree.
  const configuredRates = await resolveConfiguredRates(tx, tenantId);
  const taxResult = computeTax({ lines: taxableLines, seller, buyer, settings: { rates: configuredRates } });
  const totalSubtotal = [...lineSubtotals.values()].reduce((a, b) => a + b, 0);

  for (const line of invoice.lines) {
    const lineSubtotal = lineSubtotals.get(line.id)!;
    const share = totalSubtotal > 0 ? lineSubtotal / totalSubtotal : 0;
    const lineTax = Math.round(taxResult.totalTax * share * 100) / 100;
    await tx.invoiceLine.update({
      where: { id: line.id },
      data: { subtotal: lineSubtotal, taxAmount: lineTax, total: Math.round((lineSubtotal + lineTax) * 100) / 100 },
    });
  }

  await tx.invoice.update({
    where: { id: invoiceId },
    data: {
      subtotal: totalSubtotal,
      taxTotal: taxResult.totalTax,
      total: Math.round((totalSubtotal + taxResult.totalTax) * 100) / 100,
    },
  });

  return { taxComponents: taxResult.components };
}

/** Recomputes status from the current total/amountPaid — called after posting AND after every payment allocation change. */
async function recomputeStatus(tx: TenantTransaction, invoiceId: string): Promise<InvoiceStatus> {
  const invoice = await tx.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
  const status = deriveInvoiceStatus(
    Number(invoice.total.toString()),
    Number(invoice.amountPaid.toString()),
    invoice.status === "cancelled",
    invoice.postedAt !== null
  );
  if (status !== invoice.status) {
    await tx.invoice.update({ where: { id: invoiceId }, data: { status } });
  }
  return status;
}

/* ------------------------------------------------------------------ */
/* Queries                                                             */
/* ------------------------------------------------------------------ */

export async function listInvoices(ctx: RequestContext, query: RecordQuery): Promise<RecordPage<InvoiceListItemDTO>> {
  assertPermission(ctx.permissions, "invoicing:invoice:read");

  const scope = recordScopeWhere(
    ctx.recordScopes.includes("own_records") ? "own_records" : null,
    { userId: ctx.userId, warehouseIds: [] },
    {}
  );

  const compiled = compileQuery(query, {
    searchFields: SEARCH_FIELDS,
    allowedFields: ALLOWED_FIELDS,
    scope: { deletedAt: null, ...scope },
  });

  return withTenant(ctx.tenantId, async (tx) => {
    const [rows, total] = await Promise.all([
      tx.invoice.findMany({
        where: compiled.where,
        orderBy: compiled.orderBy,
        skip: compiled.skip,
        take: compiled.take,
        include: { partner: { select: { name: true } } },
      }),
      tx.invoice.count({ where: compiled.where }),
    ]);

    return {
      rows: rows.map((r) => {
        const total = Number(r.total.toString());
        const amountPaid = Number(r.amountPaid.toString());
        return {
          id: r.id,
          number: r.number,
          status: r.status,
          partnerName: r.partner.name,
          invoiceDate: r.invoiceDate.toISOString(),
          dueDate: r.dueDate?.toISOString() ?? null,
          total,
          amountPaid,
          outstanding: Math.max(0, Math.round((total - amountPaid) * 100) / 100),
        };
      }),
      total,
      page: query.page,
      pageSize: compiled.take,
    };
  });
}

export async function getInvoice(ctx: RequestContext, id: string): Promise<InvoiceDTO | null> {
  assertPermission(ctx.permissions, "invoicing:invoice:read");

  return withTenant(ctx.tenantId, async (tx) => {
    const invoice = await tx.invoice.findUnique({
      where: { id },
      include: {
        partner: { select: { name: true } },
        salesOrder: { select: { number: true } },
        lines: {
          orderBy: { sequence: "asc" },
          include: { product: { select: { sku: true, name: true } }, uom: { select: { code: true } }, taxCategory: true },
        },
      },
    });
    if (!invoice) return null;

    // A posted invoice's breakdown is FROZEN (taxBreakdown, written once by
    // postInvoice) -- architecture.md §5.5. Only a draft, whose lines can
    // still change, computes it live here, the same way sales/orders.ts
    // does for an order that hasn't been confirmed into anything final.
    const taxComponents = invoice.taxBreakdown
      ? (invoice.taxBreakdown as unknown as { label: string; rate: number; amount: number }[])
      : await computeLiveTaxComponents(tx, ctx.tenantId, invoice.companyId, invoice.partnerId, invoice.lines);

    const total = Number(invoice.total.toString());
    const amountPaid = Number(invoice.amountPaid.toString());

    return {
      id: invoice.id,
      number: invoice.number,
      status: invoice.status,
      partnerId: invoice.partnerId,
      partnerName: invoice.partner.name,
      currency: invoice.currency,
      salesOrderId: invoice.salesOrderId,
      salesOrderNumber: invoice.salesOrder?.number ?? null,
      invoiceDate: invoice.invoiceDate.toISOString(),
      dueDate: invoice.dueDate?.toISOString() ?? null,
      postedAt: invoice.postedAt?.toISOString() ?? null,
      subtotal: Number(invoice.subtotal.toString()),
      taxTotal: Number(invoice.taxTotal.toString()),
      total,
      amountPaid,
      outstanding: Math.max(0, Math.round((total - amountPaid) * 100) / 100),
      notes: invoice.notes,
      taxComponents,
      lines: invoice.lines.map((l) => ({
        id: l.id,
        sequence: l.sequence,
        productId: l.productId,
        productSku: l.product.sku,
        productName: l.product.name,
        description: l.description,
        uomCode: l.uom.code,
        quantity: Number(l.quantity.toString()),
        unitPrice: Number(l.unitPrice.toString()),
        discountPct: Number(l.discountPct.toString()),
        taxLabel: l.taxCategory?.name ?? "Standard",
        taxAmount: Number(l.taxAmount.toString()),
        subtotal: Number(l.subtotal.toString()),
        total: Number(l.total.toString()),
        salesOrderLineId: l.salesOrderLineId,
      })),
    };
  });
}

/* ------------------------------------------------------------------ */
/* Mutations                                                           */
/* ------------------------------------------------------------------ */

async function writeStandaloneLines(
  tx: TenantTransaction,
  tenantId: string,
  invoiceId: string,
  lines: z.infer<typeof invoiceLineInputSchema>[]
) {
  await tx.invoiceLine.deleteMany({ where: { invoiceId } });

  let sequence = 1;
  for (const line of lines) {
    const product = await tx.product.findUniqueOrThrow({ where: { id: line.productId } });
    const unitPrice = line.unitPrice ?? (await resolveUnitPrice(tx, line.productId));
    const subtotal = computeInvoiceLineSubtotal({
      quantity: line.quantity,
      unitPrice,
      discountPct: line.discountPct,
      taxRate: 0,
    });

    await tx.invoiceLine.create({
      data: {
        tenantId,
        invoiceId,
        sequence: sequence++,
        salesOrderLineId: line.salesOrderLineId ?? null,
        productId: line.productId,
        description: product.name,
        uomId: product.uomId,
        quantity: line.quantity,
        unitPrice,
        discountPct: line.discountPct,
        taxCategoryId: product.taxCategoryId,
        subtotal,
        total: subtotal,
      },
    });
  }
}

export async function createStandaloneInvoice(ctx: RequestContext, input: CreateStandaloneInvoiceInput): Promise<string> {
  assertPermission(ctx.permissions, "invoicing:invoice:write");
  const data = createStandaloneInvoiceInputSchema.parse(input);

  return withTenant(ctx.tenantId, async (tx) => {
    const [company, partner] = await Promise.all([
      tx.company.findFirstOrThrow({ where: { tenantId: ctx.tenantId }, orderBy: { createdAt: "asc" } }),
      tx.partner.findUniqueOrThrow({ where: { id: data.partnerId } }),
    ]);

    const number = await nextDocumentNumber(tx, ctx.tenantId, company.id, "invoice");

    const invoice = await tx.invoice.create({
      data: {
        tenantId: ctx.tenantId,
        companyId: company.id,
        number,
        partnerId: data.partnerId,
        currency: partner.currency ?? company.currency,
        dueDate: data.dueDate ?? null,
        notes: data.notes ?? null,
        createdBy: ctx.userId,
        updatedBy: ctx.userId,
      },
    });

    await writeStandaloneLines(tx, ctx.tenantId, invoice.id, data.lines);
    await recomputeInvoice(tx, ctx.tenantId, invoice.id);

    await tx.auditLog.create({
      data: {
        tenantId: ctx.tenantId,
        entityType: "Invoice",
        entityId: invoice.id,
        action: "created",
        actorId: ctx.userId,
        actorName: ctx.userName,
        changes: { number: { from: null, to: number } },
      },
    });

    return invoice.id;
  });
}

/**
 * Invoices a sales order, drawing quantity from qtyOrdered or qtyDelivered
 * depending on the order's invoicingPolicy (architecture.md §5.4) minus
 * what has already been invoiced -- exactly the same "remaining" check
 * createDelivery runs against qtyDelivered in sales/orders.ts.
 */
export async function createInvoiceFromOrder(
  ctx: RequestContext,
  orderId: string,
  input: CreateInvoiceFromOrderInput
): Promise<string> {
  assertPermission(ctx.permissions, "invoicing:invoice:write");
  const data = createInvoiceFromOrderInputSchema.parse(input);

  return withTenant(ctx.tenantId, async (tx) => {
    const order = await tx.salesOrder.findUniqueOrThrow({ where: { id: orderId } });
    if (order.status === "draft" || order.status === "cancelled") {
      throw new Error(`Cannot invoice an order that is ${order.status}.`);
    }

    const number = await nextDocumentNumber(tx, ctx.tenantId, order.companyId, "invoice");
    const invoice = await tx.invoice.create({
      data: {
        tenantId: ctx.tenantId,
        companyId: order.companyId,
        number,
        partnerId: order.partnerId,
        currency: order.currency,
        salesOrderId: order.id,
        createdBy: ctx.userId,
        updatedBy: ctx.userId,
      },
    });

    let sequence = 1;
    for (const requested of data.lines) {
      const line = await tx.salesOrderLine.findUniqueOrThrow({ where: { id: requested.salesOrderLineId } });
      const invoiceable =
        order.invoicingPolicy === "invoice_ordered"
          ? Number(line.qtyOrdered.toString())
          : Number(line.qtyDelivered.toString());
      const remaining = invoiceable - Number(line.qtyInvoiced.toString());
      if (requested.quantity > remaining) {
        throw new Error(`Cannot invoice ${requested.quantity} of "${line.description}" -- only ${remaining} remain invoiceable.`);
      }

      await tx.invoiceLine.create({
        data: {
          tenantId: ctx.tenantId,
          invoiceId: invoice.id,
          sequence: sequence++,
          salesOrderLineId: line.id,
          productId: line.productId,
          description: line.description,
          uomId: line.uomId,
          quantity: requested.quantity,
          unitPrice: line.unitPrice,
          discountPct: line.discountPct,
          taxCategoryId: line.taxCategoryId,
          subtotal: 0,
          total: 0,
        },
      });

      await tx.salesOrderLine.update({
        where: { id: line.id },
        data: { qtyInvoiced: { increment: requested.quantity } },
      });
    }

    await recomputeInvoice(tx, ctx.tenantId, invoice.id);

    // The order's own status (delivered / invoiced) depends on qtyInvoiced,
    // which just changed -- recompute it via the same pure function sales
    // uses, inline here rather than importing recomputeOrder (that function
    // also redoes tax, which nothing about invoicing changed).
    const freshLines = await tx.salesOrderLine.findMany({ where: { salesOrderId: orderId } });
    const quantities = freshLines.map((l) => ({
      qtyOrdered: Number(l.qtyOrdered.toString()),
      qtyDelivered: Number(l.qtyDelivered.toString()),
      qtyInvoiced: Number(l.qtyInvoiced.toString()),
    }));
    // isCancelled is always false here: the guard clause above already
    // rejected a cancelled order before this point ran.
    const orderStatus = deriveOrderStatus(quantities, false, true);
    if (orderStatus !== order.status) {
      await tx.salesOrder.update({ where: { id: orderId }, data: { status: orderStatus } });
    }

    await tx.auditLog.create({
      data: {
        tenantId: ctx.tenantId,
        entityType: "Invoice",
        entityId: invoice.id,
        action: "created",
        actorId: ctx.userId,
        actorName: ctx.userName,
        changes: { number: { from: null, to: number }, salesOrder: { from: null, to: order.number } },
      },
    });

    return invoice.id;
  });
}

export async function updateInvoiceLines(
  ctx: RequestContext,
  invoiceId: string,
  input: { lines: z.infer<typeof invoiceLineInputSchema>[] }
): Promise<void> {
  assertPermission(ctx.permissions, "invoicing:invoice:write");
  const data = z.object({ lines: z.array(invoiceLineInputSchema).min(1) }).parse(input);

  await withTenant(ctx.tenantId, async (tx) => {
    const invoice = await tx.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
    if (invoice.status !== "draft") {
      throw new Error("Only a draft invoice's lines can be edited. A posted invoice is immutable -- issue a credit note instead.");
    }
    await writeStandaloneLines(tx, ctx.tenantId, invoiceId, data.lines);
    await recomputeInvoice(tx, ctx.tenantId, invoiceId);
  });
}

/**
 * The one-way transition. Once posted, an invoice is immutable (this file's
 * header comment) and emits `invoice.posted` for a future GL subscriber
 * (docs/architecture.md §5.5) -- fired after the transaction commits, never
 * inside it, so a slow or buggy listener can never hold the invoice's own
 * write lock.
 */
export async function postInvoice(ctx: RequestContext, invoiceId: string): Promise<void> {
  assertPermission(ctx.permissions, "invoicing:invoice:post");

  const posted = await withTenant(ctx.tenantId, async (tx) => {
    const invoice = await tx.invoice.findUniqueOrThrow({
      where: { id: invoiceId },
      include: { lines: { include: { taxCategory: { select: { key: true } } } } },
    });
    if (invoice.status !== "draft") throw new Error(`Only a draft invoice can be posted (this one is ${invoice.status}).`);
    if (Number(invoice.total.toString()) <= 0) throw new Error("Cannot post an invoice with a zero or negative total.");

    // Freeze the breakdown exactly as it reads right now -- see
    // computeLiveTaxComponents's own doc comment and architecture.md §5.5.
    const taxBreakdown = await computeLiveTaxComponents(tx, ctx.tenantId, invoice.companyId, invoice.partnerId, invoice.lines);

    const now = new Date();
    await tx.invoice.update({
      where: { id: invoiceId },
      data: { postedAt: now, status: "posted", updatedBy: ctx.userId, taxBreakdown },
    });

    await tx.auditLog.create({
      data: {
        tenantId: ctx.tenantId,
        entityType: "Invoice",
        entityId: invoiceId,
        action: "posted",
        actorId: ctx.userId,
        actorName: ctx.userName,
      },
    });

    return {
      invoiceId,
      companyId: invoice.companyId,
      partnerId: invoice.partnerId,
      total: Number(invoice.total.toString()),
      currency: invoice.currency,
      postedAt: now.toISOString(),
    };
  });

  emit({ type: "invoice.posted", tenantId: ctx.tenantId, ...posted });
}

export async function cancelInvoice(ctx: RequestContext, invoiceId: string): Promise<void> {
  assertPermission(ctx.permissions, "invoicing:invoice:cancel");

  await withTenant(ctx.tenantId, async (tx) => {
    const invoice = await tx.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
    if (invoice.status !== "draft") {
      throw new Error("A posted invoice cannot be cancelled -- issue a credit note instead. Only a draft may be discarded.");
    }

    await tx.invoice.update({ where: { id: invoiceId }, data: { status: "cancelled", updatedBy: ctx.userId } });

    // Release the quantities this invoice had claimed against its order, if any.
    const lines = await tx.invoiceLine.findMany({ where: { invoiceId }, select: { salesOrderLineId: true, quantity: true } });
    for (const line of lines) {
      if (!line.salesOrderLineId) continue;
      await tx.salesOrderLine.update({
        where: { id: line.salesOrderLineId },
        data: { qtyInvoiced: { decrement: line.quantity } },
      });
    }

    await tx.auditLog.create({
      data: {
        tenantId: ctx.tenantId,
        entityType: "Invoice",
        entityId: invoiceId,
        action: "cancelled",
        actorId: ctx.userId,
        actorName: ctx.userName,
      },
    });
  });
}

export interface OpenInvoiceDTO {
  id: string;
  number: string;
  total: number;
  outstanding: number;
}

/** A partner's postable-payment targets -- feeds the payment allocation picker. */
export async function listOpenInvoicesForPartner(ctx: RequestContext, partnerId: string): Promise<OpenInvoiceDTO[]> {
  assertPermission(ctx.permissions, "invoicing:invoice:read");

  return withTenant(ctx.tenantId, async (tx) => {
    const rows = await tx.invoice.findMany({
      where: { partnerId, status: { in: ["posted", "partially_paid"] } },
      orderBy: { invoiceDate: "asc" },
    });

    return rows
      .map((r) => ({
        id: r.id,
        number: r.number,
        total: Number(r.total.toString()),
        outstanding: Math.max(0, Math.round((Number(r.total.toString()) - Number(r.amountPaid.toString())) * 100) / 100),
      }))
      .filter((r) => r.outstanding > 0);
  });
}

export { recomputeStatus as recomputeInvoiceStatus };
