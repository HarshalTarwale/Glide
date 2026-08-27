import {
  round,
  sum,
  type JurisdictionRate,
  type TaxComponent,
  type TaxInput,
  type TaxRegime,
  type TaxResult,
} from "../types";

/**
 * UNITED STATES — sales tax.
 *
 * SCOPE BOUNDARY, stated plainly (docs/architecture.md §4.2):
 * this computes tax from rates the TENANT configures. It does NOT do
 * nexus determination or automatic rate lookup by address — that is what
 * Avalara and TaxJar sell as an entire product, and pretending otherwise
 * would be worse than being explicit.
 *
 * What it does correctly:
 *   - stacks state + county + city rates, which is how US tax actually works
 *   - destination sourcing (the default in most states): rates come from the
 *     SHIP-TO address, not the seller's
 *   - resale/exemption certificates
 *   - no rates configured for a jurisdiction => 0% and a loud note, never a
 *     silent guess
 *
 * Origin-sourcing states are not modelled in v1; destination sourcing is the
 * majority rule and the safer default (it over-collects rather than
 * under-collects when wrong).
 */

const LEVEL_ORDER = { state: 0, county: 1, city: 2, national: 3 } as const;

function applicableRates(
  rates: JurisdictionRate[],
  region: string | undefined,
  city: string | undefined
): JurisdictionRate[] {
  const wanted = new Set(
    [region, city].filter(Boolean).map((v) => v!.trim().toLowerCase())
  );

  return rates
    .filter((r) => {
      if (r.level === "national") return true;
      if (!r.region) return false;
      return wanted.has(r.region.trim().toLowerCase());
    })
    .sort((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level]);
}

export const salesTaxUS: TaxRegime = {
  id: "SALES_TAX_US",
  label: "Sales tax",

  compute({ lines, seller, buyer, settings }: TaxInput): TaxResult {
    const notes: string[] = [];
    const subtotal = round(sum(lines.map((l) => l.amount)));
    const zero = (): TaxResult => ({
      components: [],
      subtotal,
      totalTax: 0,
      total: subtotal,
      notes,
      reverseCharge: false,
    });

    if (buyer.address.country !== "US") {
      notes.push("Sale outside the United States — no US sales tax.");
      return zero();
    }

    if (buyer.exemptionCertificate) {
      notes.push(`Exempt — certificate ${buyer.exemptionCertificate} on file.`);
      return zero();
    }

    // Destination sourcing: the ship-to address decides the rate.
    const destination = buyer.address;
    const configured = settings?.rates ?? [];

    if (configured.length === 0) {
      notes.push(
        "No sales tax rates configured. Add jurisdiction rates in Settings — Glide does not determine nexus automatically."
      );
      return zero();
    }

    const rates = applicableRates(configured, destination.region, destination.city);

    if (rates.length === 0) {
      notes.push(
        `No rate configured for ${[destination.city, destination.region].filter(Boolean).join(", ") || "this destination"}.`
      );
      return zero();
    }

    // Services are untaxed in many states. Without per-state service rules
    // (out of v1 scope) we tax goods only and say so.
    const taxableLines = lines.filter((l) => !l.isService && l.category !== "exempt");
    const exemptAmount = round(subtotal - sum(taxableLines.map((l) => l.amount)));
    if (exemptAmount > 0) {
      notes.push("Services and exempt items excluded from the taxable base.");
    }

    const taxableBase = round(sum(taxableLines.map((l) => l.amount)));
    if (taxableBase === 0) return zero();

    // Rates are additive on the same base — US jurisdictions do not compound.
    const components: TaxComponent[] = rates.map((r) => ({
      label: `${r.name} ${formatRate(r.rate)}%`,
      rate: r.rate,
      taxableAmount: taxableBase,
      amount: round((taxableBase * r.rate) / 100),
      kind: "SALES_TAX",
    }));

    const combined = round(sum(rates.map((r) => r.rate)));
    notes.push(
      `Destination sourcing to ${[destination.city, destination.region].filter(Boolean).join(", ")} — combined ${formatRate(combined)}%.`
    );
    void seller;

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

function formatRate(rate: number): string {
  return Number.isInteger(rate) ? String(rate) : String(round(rate, 4)).replace(/0+$/, "").replace(/\.$/, "");
}
