import {
  round,
  sum,
  type TaxCategoryKey,
  type TaxComponent,
  type TaxInput,
  type TaxRegime,
  type TaxRegimeId,
  type TaxResult,
} from "../types";

/**
 * VALUE ADDED TAX — shared engine for UK, EU and UAE.
 *
 * All three work the same way; only the rate table and a couple of local
 * rules differ, so they share one implementation rather than three
 * near-identical copies that drift apart.
 *
 * The rules that actually matter:
 *
 *   B2B cross-border  -> REVERSE CHARGE. The seller charges 0% and the buyer
 *                        accounts for the VAT in their own return. Requires a
 *                        valid VAT number; without one it is a B2C sale and
 *                        the seller must charge their own rate.
 *   B2C cross-border  -> seller charges their own domestic rate (v1 scope:
 *                        OSS distance-selling thresholds are deferred).
 *   Export outside    -> zero rated.
 *   Exempt vs zero    -> both produce 0 tax but are legally distinct and are
 *                        reported separately, so they stay separate here.
 */

/** Member states covered at v1. Full 27-state coverage before EU GA. */
export const EU_COUNTRIES = new Set([
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR",
  "DE", "GR", "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL",
  "PL", "PT", "RO", "SK", "SI", "ES", "SE",
]);

type RateTable = Record<TaxCategoryKey, number>;

/** Rates for the markets prioritised at v1. */
const EU_RATES: Record<string, RateTable> = {
  DE: { standard: 19, reduced: 7, zero: 0, exempt: 0 },
  FR: { standard: 20, reduced: 5.5, zero: 0, exempt: 0 },
  IT: { standard: 22, reduced: 10, zero: 0, exempt: 0 },
  ES: { standard: 21, reduced: 10, zero: 0, exempt: 0 },
  NL: { standard: 21, reduced: 9, zero: 0, exempt: 0 },
  IE: { standard: 23, reduced: 13.5, zero: 0, exempt: 0 },
};

const EU_FALLBACK: RateTable = { standard: 21, reduced: 10, zero: 0, exempt: 0 };

interface VatConfig {
  id: TaxRegimeId;
  label: string;
  /** Countries treated as "domestic" for this regime. */
  isDomestic(country: string): boolean;
  /** Rate table for the seller's country. */
  ratesFor(country: string): RateTable;
  /** Cross-border B2B reverse charge applies within this bloc only. */
  allowsReverseCharge(sellerCountry: string, buyerCountry: string): boolean;
  /** UAE designated zones sit outside the scope of VAT. */
  honoursDesignatedZone?: boolean;
}

function build(config: VatConfig): TaxRegime {
  return {
    id: config.id,
    label: config.label,

    compute({ lines, seller, buyer, settings }: TaxInput): TaxResult {
      const notes: string[] = [];
      const subtotal = round(sum(lines.map((l) => l.amount)));
      const zero = (reverseCharge = false): TaxResult => ({
        components: [],
        subtotal,
        totalTax: 0,
        total: subtotal,
        notes,
        reverseCharge,
      });

      const sellerCountry = seller.address.country;
      const buyerCountry = buyer.address.country;

      if (config.honoursDesignatedZone && buyer.inDesignatedZone) {
        notes.push("Supply to a designated zone — outside the scope of VAT.");
        return zero();
      }

      // Outside the bloc entirely: an export, zero rated.
      if (!config.isDomestic(buyerCountry)) {
        notes.push("Export outside the VAT area — zero rated.");
        return zero();
      }

      const isCrossBorder = sellerCountry !== buyerCountry;
      const buyerIsBusiness = Boolean(buyer.taxId) && buyer.isRegistered !== false;

      if (
        isCrossBorder &&
        buyerIsBusiness &&
        config.allowsReverseCharge(sellerCountry, buyerCountry)
      ) {
        notes.push(
          `Reverse charge — VAT to be accounted for by the recipient (${buyer.taxId}).`
        );
        return zero(true);
      }

      if (isCrossBorder && !buyerIsBusiness) {
        notes.push(
          "Cross-border B2C — seller's domestic rate applied. OSS thresholds are not modelled in v1."
        );
      }

      const table = config.ratesFor(sellerCountry);

      const buckets = new Map<number, { taxable: number; category: TaxCategoryKey }>();
      for (const line of lines) {
        const override = settings?.rates?.find((r) => r.category === line.category)?.rate;
        const rate = override ?? table[line.category] ?? 0;
        const existing = buckets.get(rate);
        buckets.set(rate, {
          taxable: round((existing?.taxable ?? 0) + line.amount),
          category: existing?.category ?? line.category,
        });
      }

      const components: TaxComponent[] = [];
      for (const [rate, bucket] of [...buckets.entries()].sort((a, b) => a[0] - b[0])) {
        if (rate === 0) {
          // Zero-rated and exempt both produce no tax but are reported
          // separately, so the distinction is preserved in the notes.
          if (bucket.category === "exempt") notes.push("Includes VAT-exempt items.");
          else if (bucket.category === "zero") notes.push("Includes zero-rated items.");
          continue;
        }
        components.push({
          label: `${config.label} ${formatRate(rate)}%`,
          rate,
          taxableAmount: bucket.taxable,
          amount: round((bucket.taxable * rate) / 100),
          kind: "VAT",
        });
      }

      const totalTax = round(sum(components.map((c) => c.amount)));
      return {
        components,
        subtotal,
        totalTax,
        total: round(subtotal + totalTax),
        notes,
        reverseCharge: false,
      };
    },
  };
}

function formatRate(rate: number): string {
  return Number.isInteger(rate) ? String(rate) : String(round(rate, 2));
}

/** United Kingdom. Post-Brexit: no reverse charge with the EU. */
export const vatUK = build({
  id: "VAT_GB",
  label: "VAT",
  isDomestic: (c) => c === "GB",
  ratesFor: () => ({ standard: 20, reduced: 5, zero: 0, exempt: 0 }),
  // Domestic-only regime, so cross-border reverse charge never arises here.
  allowsReverseCharge: () => false,
});

/** European Union. Intra-community B2B supplies reverse charge. */
export const vatEU = build({
  id: "VAT_EU",
  label: "VAT",
  isDomestic: (c) => EU_COUNTRIES.has(c),
  ratesFor: (c) => EU_RATES[c] ?? EU_FALLBACK,
  allowsReverseCharge: (sellerCountry, buyerCountry) =>
    EU_COUNTRIES.has(sellerCountry) && EU_COUNTRIES.has(buyerCountry),
});

/** United Arab Emirates. Flat 5%, designated zones out of scope. */
export const vatUAE = build({
  id: "VAT_AE",
  label: "VAT",
  isDomestic: (c) => c === "AE",
  ratesFor: () => ({ standard: 5, reduced: 5, zero: 0, exempt: 0 }),
  allowsReverseCharge: () => false,
  honoursDesignatedZone: true,
});
