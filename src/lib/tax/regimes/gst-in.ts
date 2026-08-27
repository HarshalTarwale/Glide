import {
  round,
  sum,
  type TaxComponent,
  type TaxInput,
  type TaxRegime,
  type TaxResult,
  type TaxableLine,
} from "../types";

/**
 * INDIA — Goods and Services Tax.
 *
 * The defining rule, and the one every naive implementation gets wrong:
 *
 *   Intra-state supply (seller state == place of supply)
 *       -> CGST + SGST, each HALF the total rate
 *   Inter-state supply (different states)
 *       -> IGST at the FULL rate
 *
 * The total tax is identical either way. What differs is who collects it —
 * centre and state split it intra-state, centre alone collects inter-state
 * and later apportions. Getting the split wrong produces a return that will
 * not reconcile, so this is not cosmetic.
 *
 * Place of supply for goods is the delivery address. For services it is the
 * recipient's location when they are registered.
 */

const GST_RATES: Record<string, number> = {
  standard: 18,
  reduced: 5,
  zero: 0,
  exempt: 0,
};

function rateFor(line: TaxableLine, configured?: number): number {
  if (configured !== undefined) return configured;
  return GST_RATES[line.category] ?? 0;
}

export const gstIndia: TaxRegime = {
  id: "GST_IN",
  label: "GST",

  compute({ lines, seller, buyer, settings }: TaxInput): TaxResult {
    const notes: string[] = [];
    const subtotal = round(sum(lines.map((l) => l.amount)));

    const sellerRegion = seller.address.region?.trim().toLowerCase();
    const buyerRegion = buyer.address.region?.trim().toLowerCase();

    // Export: outside India is a zero-rated supply, not an exempt one — the
    // seller still reclaims input credit, so it must be reported, not omitted.
    if (buyer.address.country !== "IN") {
      notes.push("Export supply — zero rated under GST.");
      return { components: [], subtotal, totalTax: 0, total: subtotal, notes, reverseCharge: false };
    }

    if (seller.address.country !== "IN") {
      notes.push("Import — GST payable by the recipient under reverse charge.");
      return { components: [], subtotal, totalTax: 0, total: subtotal, notes, reverseCharge: true };
    }

    // Missing state means we cannot determine place of supply. Fail loudly
    // rather than guessing intra-state and under-collecting IGST.
    if (!sellerRegion || !buyerRegion) {
      throw new Error(
        "GST requires a state on both the seller and the buyer address to determine place of supply."
      );
    }

    const isIntraState = sellerRegion === buyerRegion;

    const buckets = new Map<number, number>();
    for (const line of lines) {
      const rate = rateFor(line, findConfiguredRate(line, settings));
      buckets.set(rate, round((buckets.get(rate) ?? 0) + line.amount));
    }

    const components: TaxComponent[] = [];

    for (const [rate, taxable] of [...buckets.entries()].sort((a, b) => a[0] - b[0])) {
      if (rate === 0) continue;

      if (isIntraState) {
        const half = rate / 2;
        // Compute the bucket's tax ONCE, then split it — rather than rounding
        // each half independently. Independent rounding makes CGST + SGST
        // differ from the IGST on an identical sale by a paisa, and makes the
        // components stop summing to the invoice total. Both are the kind of
        // discrepancy a customer's accountant reports as a bug.
        // The remainder goes to SGST so the two always reconcile exactly.
        const bucketTax = round((taxable * rate) / 100);
        const cgst = round(bucketTax / 2);
        const sgst = round(bucketTax - cgst);
        components.push({
          label: `CGST ${formatRate(half)}%`,
          rate: half,
          taxableAmount: taxable,
          amount: cgst,
          kind: "CGST",
        });
        components.push({
          label: `SGST ${formatRate(half)}%`,
          rate: half,
          taxableAmount: taxable,
          amount: sgst,
          kind: "SGST",
        });
      } else {
        components.push({
          label: `IGST ${formatRate(rate)}%`,
          rate,
          taxableAmount: taxable,
          amount: round((taxable * rate) / 100),
          kind: "IGST",
        });
      }
    }

    notes.push(
      isIntraState
        ? `Intra-state supply (${seller.address.region}) — CGST + SGST.`
        : `Inter-state supply (${seller.address.region} → ${buyer.address.region}) — IGST.`
    );

    const totalTax = round(sum(components.map((c) => c.amount)));
    return { components, subtotal, totalTax, total: round(subtotal + totalTax), notes, reverseCharge: false };
  },
};

/** A tenant may override the statutory band rates from Settings. */
function findConfiguredRate(line: TaxableLine, settings?: TaxInput["settings"]) {
  return settings?.rates?.find((r) => r.category === line.category)?.rate;
}

/** 2.5 -> "2.5", 9 -> "9". Avoids "9.0%" on invoices. */
function formatRate(rate: number): string {
  return Number.isInteger(rate) ? String(rate) : String(round(rate, 2));
}
