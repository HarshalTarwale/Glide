import { findCountry } from "@/lib/i18n/countries";
import { gstIndia } from "./regimes/gst-in";
import { salesTaxUS } from "./regimes/sales-tax-us";
import { EU_COUNTRIES, vatEU, vatUAE, vatUK } from "./regimes/vat";
import { round, sum, type TaxInput, type TaxRegime, type TaxRegimeId, type TaxResult } from "./types";

export * from "./types";

/** No tax at all. Used by tenants not registered anywhere. */
const noTax: TaxRegime = {
  id: "NONE",
  label: "Tax",
  compute({ lines }: TaxInput): TaxResult {
    const subtotal = round(sum(lines.map((l) => l.amount)));
    return { components: [], subtotal, totalTax: 0, total: subtotal, notes: [], reverseCharge: false };
  },
};

export const REGIMES: Record<TaxRegimeId, TaxRegime> = {
  GST_IN: gstIndia,
  VAT_GB: vatUK,
  VAT_EU: vatEU,
  VAT_AE: vatUAE,
  SALES_TAX_US: salesTaxUS,
  NONE: noTax,
};

export function getRegime(id: TaxRegimeId): TaxRegime {
  return REGIMES[id] ?? noTax;
}

/**
 * Which regime governs a seller in this country.
 *
 * Deliberately STRICT: an unknown country resolves to NONE, never to the
 * default country's regime. getCountry() falls back to India for display
 * purposes, and silently taxing a German sale under Indian GST because of a
 * display fallback would be a serious, hard-to-spot bug.
 *
 * EU member states we have not written a CountryPack for still resolve to
 * VAT_EU, since the regime knows the whole bloc.
 */
export function resolveRegimeId(country: string): TaxRegimeId {
  const pack = findCountry(country);
  if (pack) return pack.taxRegime;
  if (EU_COUNTRIES.has(country)) return "VAT_EU";
  return "NONE";
}

/**
 * The single entry point every document uses.
 *
 * The regime is chosen from the SELLER's country — the seller carries the
 * filing obligation. Adding a country means adding a CountryPack row and a
 * TaxRegime implementation; no screen changes.
 */
export function computeTax(input: TaxInput): TaxResult {
  return getRegime(resolveRegimeId(input.seller.address.country)).compute(input);
}
