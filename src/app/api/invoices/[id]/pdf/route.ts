import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { requireContext } from "@/server/context";
import { getInvoice } from "@/server/invoicing/invoices";
import { getCompany } from "@/server/core/company";
import { PermissionError } from "@/lib/auth/permissions";
import { InvoicePdfDocument } from "@/lib/invoicing/invoice-pdf";

/**
 * The PDF the roadmap's P4 scope names explicitly, generated on request
 * rather than cached -- an invoice's own fields never change after posting,
 * but this keeps a draft's preview always current while it's still being
 * edited. Lives under /api rather than /app since it returns a binary
 * download, not a page.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let ctx;
  try {
    ctx = await requireContext();
  } catch {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  try {
    const [invoice, company] = await Promise.all([getInvoice(ctx, id), getCompany(ctx)]);
    if (!invoice) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });

    const buffer = await renderToBuffer(
      InvoicePdfDocument({
        invoice,
        seller: {
          name: company?.name ?? ctx.tenantName,
          addressLine1: company?.addressLine1,
          city: company?.city,
          region: company?.region,
          country: company?.country ?? ctx.country,
          taxId: company?.taxId,
        },
      })
    );

    // Buffer satisfies BodyInit at runtime, but its type doesn't structurally
    // match the DOM lib's Uint8Array<ArrayBuffer> overload -- an explicit
    // copy is the honest fix, not a cast.
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${invoice.number}.pdf"`,
      },
    });
  } catch (error) {
    if (error instanceof PermissionError) return NextResponse.json({ error: error.message }, { status: 403 });
    throw error;
  }
}
