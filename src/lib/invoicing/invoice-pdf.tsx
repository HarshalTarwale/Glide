import { Document, Page, View, Text, StyleSheet } from "@react-pdf/renderer";
import type { InvoiceDTO } from "@/server/invoicing/invoices";

/**
 * The printable invoice, per the roadmap's P4 scope line. Server-only --
 * rendered to a buffer by the route handler at
 * src/app/api/invoices/[id]/pdf/route.ts, never shipped to the client.
 *
 * Deliberately plain: no logo/branding asset pipeline yet (that is a
 * tenant-settings feature, not a P4 one) -- this proves the mechanism with
 * every number a real invoice needs to be legally usable: seller/buyer,
 * line items, tax breakdown, and totals.
 */

const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 10, fontFamily: "Helvetica", color: "#111111" },
  header: { flexDirection: "row", justifyContent: "space-between", marginBottom: 24 },
  title: { fontSize: 22, fontFamily: "Helvetica-Bold" },
  meta: { marginTop: 4, color: "#555555" },
  partiesRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 24 },
  partyBlock: { width: "45%" },
  partyLabel: { fontSize: 8, textTransform: "uppercase", color: "#888888", marginBottom: 4, letterSpacing: 0.5 },
  partyName: { fontSize: 11, fontFamily: "Helvetica-Bold" },
  table: { marginTop: 8, borderTop: "1 solid #dddddd" },
  tableRow: { flexDirection: "row", borderBottom: "1 solid #eeeeee", paddingVertical: 6 },
  tableHeaderRow: { flexDirection: "row", borderBottom: "1 solid #111111", paddingVertical: 6, fontFamily: "Helvetica-Bold" },
  colDesc: { width: "40%" },
  colQty: { width: "12%", textAlign: "right" },
  colPrice: { width: "16%", textAlign: "right" },
  colTax: { width: "16%", textAlign: "right" },
  colTotal: { width: "16%", textAlign: "right" },
  totals: { marginTop: 16, alignSelf: "flex-end", width: "45%" },
  totalsRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 3 },
  totalsRowFinal: { flexDirection: "row", justifyContent: "space-between", paddingTop: 6, marginTop: 4, borderTop: "1 solid #111111", fontFamily: "Helvetica-Bold", fontSize: 12 },
  footer: { marginTop: 32, fontSize: 8, color: "#888888" },
});

function money(value: number, currency: string): string {
  return `${currency} ${value.toFixed(2)}`;
}

export function InvoicePdfDocument({
  invoice,
  seller,
}: {
  invoice: InvoiceDTO;
  seller: { name: string; addressLine1?: string | null; city?: string | null; region?: string | null; country: string; taxId?: string | null };
}) {
  return (
    <Document title={`Invoice ${invoice.number}`}>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>INVOICE</Text>
            <Text style={styles.meta}>{invoice.number}</Text>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={styles.meta}>Invoice date: {new Date(invoice.invoiceDate).toLocaleDateString()}</Text>
            {invoice.dueDate ? <Text style={styles.meta}>Due date: {new Date(invoice.dueDate).toLocaleDateString()}</Text> : null}
            {invoice.postedAt ? <Text style={styles.meta}>Status: Posted</Text> : <Text style={styles.meta}>Status: Draft</Text>}
          </View>
        </View>

        <View style={styles.partiesRow}>
          <View style={styles.partyBlock}>
            <Text style={styles.partyLabel}>From</Text>
            <Text style={styles.partyName}>{seller.name}</Text>
            {seller.addressLine1 ? <Text>{seller.addressLine1}</Text> : null}
            <Text>
              {[seller.city, seller.region, seller.country].filter(Boolean).join(", ")}
            </Text>
            {seller.taxId ? <Text>Tax ID: {seller.taxId}</Text> : null}
          </View>
          <View style={styles.partyBlock}>
            <Text style={styles.partyLabel}>Bill to</Text>
            <Text style={styles.partyName}>{invoice.partnerName}</Text>
          </View>
        </View>

        <View style={styles.table}>
          <View style={styles.tableHeaderRow}>
            <Text style={styles.colDesc}>Description</Text>
            <Text style={styles.colQty}>Qty</Text>
            <Text style={styles.colPrice}>Unit price</Text>
            <Text style={styles.colTax}>Tax</Text>
            <Text style={styles.colTotal}>Total</Text>
          </View>
          {invoice.lines.map((line) => (
            <View key={line.id} style={styles.tableRow}>
              <Text style={styles.colDesc}>{line.description}</Text>
              <Text style={styles.colQty}>
                {line.quantity} {line.uomCode}
              </Text>
              <Text style={styles.colPrice}>{money(line.unitPrice, invoice.currency)}</Text>
              <Text style={styles.colTax}>{money(line.taxAmount, invoice.currency)}</Text>
              <Text style={styles.colTotal}>{money(line.total, invoice.currency)}</Text>
            </View>
          ))}
        </View>

        <View style={styles.totals}>
          <View style={styles.totalsRow}>
            <Text>Subtotal</Text>
            <Text>{money(invoice.subtotal, invoice.currency)}</Text>
          </View>
          {invoice.taxComponents.map((c) => (
            <View key={c.label} style={styles.totalsRow}>
              <Text>
                {c.label} ({c.rate}%)
              </Text>
              <Text>{money(c.amount, invoice.currency)}</Text>
            </View>
          ))}
          <View style={styles.totalsRowFinal}>
            <Text>Total</Text>
            <Text>{money(invoice.total, invoice.currency)}</Text>
          </View>
          {invoice.amountPaid > 0 ? (
            <>
              <View style={styles.totalsRow}>
                <Text>Paid</Text>
                <Text>{money(invoice.amountPaid, invoice.currency)}</Text>
              </View>
              <View style={styles.totalsRow}>
                <Text>Balance due</Text>
                <Text>{money(invoice.outstanding, invoice.currency)}</Text>
              </View>
            </>
          ) : null}
        </View>

        {invoice.notes ? (
          <View style={{ marginTop: 24 }}>
            <Text style={styles.partyLabel}>Notes</Text>
            <Text>{invoice.notes}</Text>
          </View>
        ) : null}

        <Text style={styles.footer}>Generated by Glide · {invoice.number}</Text>
      </Page>
    </Document>
  );
}
