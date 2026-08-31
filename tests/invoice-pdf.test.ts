import { describe, expect, it } from "vitest";
import { renderToBuffer } from "@react-pdf/renderer";
import { InvoicePdfDocument } from "@/lib/invoicing/invoice-pdf";
import type { InvoiceDTO } from "@/server/invoicing/invoices";

/**
 * The PDF generator has no database dependency of its own -- it takes the
 * same InvoiceDTO the record page already renders and produces a document,
 * so this runs everywhere (no `hasDatabase` gate), unlike tests/invoicing.test.ts.
 */

function makeInvoice(overrides: Partial<InvoiceDTO> = {}): InvoiceDTO {
  return {
    id: "inv-1",
    number: "INV-2026-0001",
    status: "posted",
    partnerId: "partner-1",
    partnerName: "Acme Industrial Supplies",
    currency: "USD",
    salesOrderId: null,
    salesOrderNumber: null,
    invoiceDate: new Date("2026-08-01").toISOString(),
    dueDate: new Date("2026-08-31").toISOString(),
    postedAt: new Date("2026-08-01").toISOString(),
    subtotal: 1000,
    taxTotal: 180,
    total: 1180,
    amountPaid: 400,
    outstanding: 780,
    notes: "Net 30 payment terms.",
    taxComponents: [{ label: "GST 18%", rate: 18, amount: 180 }],
    lines: [
      {
        id: "line-1",
        sequence: 1,
        productId: "product-1",
        productSku: "SKU-1",
        productName: "Widget",
        description: "Widget",
        uomCode: "pcs",
        quantity: 10,
        unitPrice: 100,
        discountPct: 0,
        taxLabel: "Standard",
        taxAmount: 180,
        subtotal: 1000,
        total: 1180,
        salesOrderLineId: null,
      },
    ],
    ...overrides,
  };
}

describe("invoice PDF generation", () => {
  it("renders a valid PDF for a posted invoice with lines, tax and payment info", async () => {
    const buffer = await renderToBuffer(
      InvoicePdfDocument({
        invoice: makeInvoice(),
        seller: { name: "Northwind Traders", addressLine1: "1 Trade Street", city: "Mumbai", region: "Maharashtra", country: "IN", taxId: "27AAAAA0000A1Z5" },
      })
    );

    // A real PDF: starts with the %PDF magic header, ends with %%EOF, and is
    // large enough to actually contain content (not an empty/error shell).
    expect(buffer.subarray(0, 5).toString("ascii")).toBe("%PDF-");
    expect(buffer.length).toBeGreaterThan(1000);
    expect(buffer.subarray(-1024).toString("latin1")).toContain("%%EOF");
  });

  it("renders a draft invoice (no postedAt, no payment section) without throwing", async () => {
    const buffer = await renderToBuffer(
      InvoicePdfDocument({
        invoice: makeInvoice({ status: "draft", postedAt: null, amountPaid: 0, outstanding: 1180, dueDate: null }),
        seller: { name: "Northwind Traders", country: "US" },
      })
    );
    expect(buffer.subarray(0, 5).toString("ascii")).toBe("%PDF-");
  });

  it("renders an invoice with several tax components (CGST + SGST) and multiple lines", async () => {
    const invoice = makeInvoice({
      taxComponents: [
        { label: "CGST 9%", rate: 9, amount: 90 },
        { label: "SGST 9%", rate: 9, amount: 90 },
      ],
      lines: [
        ...makeInvoice().lines,
        {
          id: "line-2",
          sequence: 2,
          productId: "product-2",
          productSku: "SKU-2",
          productName: "Gadget",
          description: "Gadget",
          uomCode: "pcs",
          quantity: 5,
          unitPrice: 50,
          discountPct: 10,
          taxLabel: "Standard",
          taxAmount: 40.5,
          subtotal: 225,
          total: 265.5,
          salesOrderLineId: "sol-1",
        },
      ],
    });

    const buffer = await renderToBuffer(
      InvoicePdfDocument({ invoice, seller: { name: "Northwind Traders", country: "IN", region: "Maharashtra" } })
    );
    expect(buffer.subarray(0, 5).toString("ascii")).toBe("%PDF-");
  });
});
