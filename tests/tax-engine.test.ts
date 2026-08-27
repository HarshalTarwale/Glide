import { describe, expect, it } from "vitest";
import { computeTax, getRegime, resolveRegimeId } from "@/lib/tax";
import type { TaxParty, TaxableLine } from "@/lib/tax/types";

/**
 * THE P1 ACCEPTANCE GATE (docs/roadmap.md §P1).
 *
 * Golden cases per regime. Tax is the one place in an ERP where being wrong
 * is not a bug report — it is a filing that does not reconcile, found by
 * someone's accountant months later. Every figure below is hand-computed.
 */

const line = (amount: number, over: Partial<TaxableLine> = {}): TaxableLine => ({
  id: "l1",
  amount,
  category: "standard",
  ...over,
});

const party = (country: string, region?: string, over: Partial<TaxParty> = {}): TaxParty => ({
  address: { country, region },
  ...over,
});

/* ================================================================== */
/* INDIA — GST                                                        */
/* ================================================================== */

describe("India GST", () => {
  it("splits an intra-state supply into CGST + SGST at half the rate each", () => {
    // 10,000 @ 18% = 1,800 -> CGST 900 + SGST 900
    const result = computeTax({
      lines: [line(10000)],
      seller: party("IN", "Maharashtra"),
      buyer: party("IN", "Maharashtra"),
    });

    expect(result.components).toHaveLength(2);
    expect(result.components[0]).toMatchObject({ kind: "CGST", rate: 9, amount: 900 });
    expect(result.components[1]).toMatchObject({ kind: "SGST", rate: 9, amount: 900 });
    expect(result.totalTax).toBe(1800);
    expect(result.total).toBe(11800);
  });

  it("charges IGST at the full rate on an inter-state supply", () => {
    const result = computeTax({
      lines: [line(10000)],
      seller: party("IN", "Maharashtra"),
      buyer: party("IN", "Karnataka"),
    });

    expect(result.components).toHaveLength(1);
    expect(result.components[0]).toMatchObject({ kind: "IGST", rate: 18, amount: 1800 });
    expect(result.totalTax).toBe(1800);
  });

  it("collects the same total either way — only the split differs", () => {
    const lines = [line(7350.5)];
    const intra = computeTax({
      lines,
      seller: party("IN", "Gujarat"),
      buyer: party("IN", "Gujarat"),
    });
    const inter = computeTax({
      lines,
      seller: party("IN", "Gujarat"),
      buyer: party("IN", "Delhi"),
    });

    expect(intra.totalTax).toBeCloseTo(inter.totalTax, 2);
  });

  it("compares states case- and whitespace-insensitively", () => {
    const result = computeTax({
      lines: [line(1000)],
      seller: party("IN", "  maharashtra "),
      buyer: party("IN", "Maharashtra"),
    });
    expect(result.components[0].kind).toBe("CGST");
  });

  it("buckets mixed rates separately", () => {
    // 1,000 @ 18% = 180 ; 2,000 @ 5% = 100
    const result = computeTax({
      lines: [line(1000, { id: "a" }), line(2000, { id: "b", category: "reduced" })],
      seller: party("IN", "Delhi"),
      buyer: party("IN", "Haryana"),
    });

    const igst = result.components.filter((c) => c.kind === "IGST");
    expect(igst).toHaveLength(2);
    expect(igst.find((c) => c.rate === 5)?.amount).toBe(100);
    expect(igst.find((c) => c.rate === 18)?.amount).toBe(180);
    expect(result.totalTax).toBe(280);
  });

  it("zero-rates an export", () => {
    const result = computeTax({
      lines: [line(5000)],
      seller: party("IN", "Maharashtra"),
      buyer: party("US", "California"),
    });
    expect(result.totalTax).toBe(0);
    expect(result.notes.join(" ")).toMatch(/export/i);
  });

  it("refuses to guess when place of supply is unknown", () => {
    // Guessing intra-state here would under-collect IGST on a real
    // inter-state sale. Failing loudly is the correct behaviour.
    expect(() =>
      computeTax({ lines: [line(1000)], seller: party("IN", "Delhi"), buyer: party("IN") })
    ).toThrow(/place of supply/i);
  });

  it("never emits a 9.0% style label", () => {
    const result = computeTax({
      lines: [line(1000)],
      seller: party("IN", "Delhi"),
      buyer: party("IN", "Delhi"),
    });
    expect(result.components[0].label).toBe("CGST 9%");
  });
});

/* ================================================================== */
/* UNITED KINGDOM — VAT                                               */
/* ================================================================== */

describe("UK VAT", () => {
  it("charges 20% standard rate domestically", () => {
    const result = computeTax({
      lines: [line(1000)],
      seller: party("GB"),
      buyer: party("GB"),
    });
    expect(result.components[0]).toMatchObject({ kind: "VAT", rate: 20, amount: 200 });
    expect(result.total).toBe(1200);
  });

  it("applies the 5% reduced rate", () => {
    const result = computeTax({
      lines: [line(1000, { category: "reduced" })],
      seller: party("GB"),
      buyer: party("GB"),
    });
    expect(result.totalTax).toBe(50);
  });

  it("distinguishes zero-rated from exempt in the notes", () => {
    const zeroRated = computeTax({
      lines: [line(1000, { category: "zero" })],
      seller: party("GB"),
      buyer: party("GB"),
    });
    const exempt = computeTax({
      lines: [line(1000, { category: "exempt" })],
      seller: party("GB"),
      buyer: party("GB"),
    });

    expect(zeroRated.totalTax).toBe(0);
    expect(exempt.totalTax).toBe(0);
    expect(zeroRated.notes.join(" ")).toMatch(/zero-rated/i);
    expect(exempt.notes.join(" ")).toMatch(/exempt/i);
  });

  it("zero-rates an export outside the UK", () => {
    const result = computeTax({
      lines: [line(1000)],
      seller: party("GB"),
      buyer: party("DE", undefined, { taxId: "DE123456789" }),
    });
    // Post-Brexit: no intra-community reverse charge, it is simply an export.
    expect(result.totalTax).toBe(0);
    expect(result.notes.join(" ")).toMatch(/export/i);
  });
});

/* ================================================================== */
/* EUROPEAN UNION — VAT                                               */
/* ================================================================== */

describe("EU VAT", () => {
  it("charges the seller's domestic rate on a domestic sale", () => {
    const result = computeTax({
      lines: [line(1000)],
      seller: party("DE"),
      buyer: party("DE"),
    });
    expect(result.components[0].rate).toBe(19);
    expect(result.totalTax).toBe(190);
  });

  it("reverse-charges a cross-border B2B supply with a valid VAT number", () => {
    const result = computeTax({
      lines: [line(1000)],
      seller: party("DE"),
      buyer: party("FR", undefined, { taxId: "FR12345678901" }),
    });

    expect(result.totalTax).toBe(0);
    expect(result.reverseCharge).toBe(true);
    expect(result.notes.join(" ")).toMatch(/reverse charge/i);
  });

  it("charges the seller's rate cross-border when the buyer has no VAT number", () => {
    // No VAT number means B2C, and B2C does not reverse charge. Treating a
    // missing number as B2B is how sellers end up owing uncollected VAT.
    const result = computeTax({
      lines: [line(1000)],
      seller: party("DE"),
      buyer: party("FR"),
    });

    expect(result.reverseCharge).toBe(false);
    expect(result.totalTax).toBe(190);
  });

  it("uses a per-member-state rate table", () => {
    const rate = (country: string) =>
      computeTax({ lines: [line(1000)], seller: party(country), buyer: party(country) })
        .components[0].rate;

    expect(rate("DE")).toBe(19);
    expect(rate("FR")).toBe(20);
    expect(rate("IT")).toBe(22);
    expect(rate("IE")).toBe(23);
  });

  it("zero-rates an export outside the EU", () => {
    const result = computeTax({
      lines: [line(1000)],
      seller: party("DE"),
      buyer: party("US", "California"),
    });
    expect(result.totalTax).toBe(0);
  });
});

/* ================================================================== */
/* UAE — VAT                                                          */
/* ================================================================== */

describe("UAE VAT", () => {
  it("charges a flat 5%", () => {
    const result = computeTax({
      lines: [line(1000)],
      seller: party("AE", "Dubai"),
      buyer: party("AE", "Dubai"),
    });
    expect(result.components[0]).toMatchObject({ rate: 5, amount: 50 });
  });

  it("treats a designated zone as out of scope", () => {
    const result = computeTax({
      lines: [line(1000)],
      seller: party("AE", "Dubai"),
      buyer: party("AE", "Jebel Ali", { inDesignatedZone: true }),
    });
    expect(result.totalTax).toBe(0);
    expect(result.notes.join(" ")).toMatch(/designated zone/i);
  });
});

/* ================================================================== */
/* UNITED STATES — sales tax                                          */
/* ================================================================== */

describe("US sales tax", () => {
  const rates = [
    { name: "CA State", rate: 6, level: "state" as const, region: "California" },
    { name: "LA County", rate: 0.25, level: "county" as const, region: "Los Angeles" },
    { name: "LA City", rate: 1, level: "city" as const, region: "Los Angeles" },
  ];

  it("stacks state, county and city rates additively", () => {
    // 1,000 @ (6 + 0.25 + 1) = 72.50 total
    const result = computeTax({
      lines: [line(1000)],
      seller: party("US", "California"),
      buyer: { address: { country: "US", region: "California", city: "Los Angeles" } },
      settings: { rates },
    });

    expect(result.components).toHaveLength(3);
    expect(result.components.map((c) => c.amount)).toEqual([60, 2.5, 10]);
    expect(result.totalTax).toBe(72.5);
  });

  it("orders the stack state -> county -> city", () => {
    const result = computeTax({
      lines: [line(1000)],
      seller: party("US", "California"),
      buyer: { address: { country: "US", region: "California", city: "Los Angeles" } },
      settings: { rates: [...rates].reverse() },
    });
    expect(result.components.map((c) => c.label)).toEqual([
      "CA State 6%",
      "LA County 0.25%",
      "LA City 1%",
    ]);
  });

  it("sources to the destination, not the seller", () => {
    // Seller in California, buyer in a state with no configured rate.
    const result = computeTax({
      lines: [line(1000)],
      seller: party("US", "California"),
      buyer: { address: { country: "US", region: "Oregon" } },
      settings: { rates },
    });
    expect(result.totalTax).toBe(0);
    expect(result.notes.join(" ")).toMatch(/no rate configured/i);
  });

  it("honours an exemption certificate", () => {
    const result = computeTax({
      lines: [line(1000)],
      seller: party("US", "California"),
      buyer: {
        address: { country: "US", region: "California", city: "Los Angeles" },
        exemptionCertificate: "RESALE-9912",
      },
      settings: { rates },
    });
    expect(result.totalTax).toBe(0);
    expect(result.notes.join(" ")).toMatch(/RESALE-9912/);
  });

  it("excludes services from the taxable base", () => {
    const result = computeTax({
      lines: [line(1000, { id: "goods" }), line(500, { id: "svc", isService: true })],
      seller: party("US", "California"),
      buyer: { address: { country: "US", region: "California", city: "Los Angeles" } },
      settings: { rates },
    });
    // Only the 1,000 of goods is taxed.
    expect(result.components[0].taxableAmount).toBe(1000);
    expect(result.subtotal).toBe(1500);
  });

  it("says so loudly rather than guessing when no rates are configured", () => {
    const result = computeTax({
      lines: [line(1000)],
      seller: party("US", "California"),
      buyer: { address: { country: "US", region: "California" } },
    });
    expect(result.totalTax).toBe(0);
    expect(result.notes.join(" ")).toMatch(/does not determine nexus/i);
  });
});

/* ================================================================== */
/* Cross-cutting                                                      */
/* ================================================================== */

describe("engine invariants", () => {
  const cases = [
    { seller: party("IN", "Delhi"), buyer: party("IN", "Delhi") },
    { seller: party("GB"), buyer: party("GB") },
    { seller: party("DE"), buyer: party("DE") },
    { seller: party("AE", "Dubai"), buyer: party("AE", "Dubai") },
  ];

  it("always satisfies subtotal + totalTax === total", () => {
    for (const c of cases) {
      const result = computeTax({ lines: [line(1234.56)], ...c });
      expect(result.total).toBeCloseTo(result.subtotal + result.totalTax, 2);
    }
  });

  it("totalTax always equals the sum of its components", () => {
    for (const c of cases) {
      const result = computeTax({ lines: [line(999.99)], ...c });
      const componentSum = result.components.reduce((s, x) => s + x.amount, 0);
      expect(result.totalTax).toBeCloseTo(componentSum, 2);
    }
  });

  it("returns zero tax for an empty document without throwing", () => {
    for (const c of cases) {
      const result = computeTax({ lines: [], ...c });
      expect(result.totalTax).toBe(0);
      expect(result.total).toBe(0);
    }
  });

  it("resolves every regime id to an implementation", () => {
    for (const id of ["GST_IN", "VAT_GB", "VAT_EU", "VAT_AE", "SALES_TAX_US", "NONE"] as const) {
      expect(getRegime(id).id).toBe(id);
    }
  });

  it("never falls back to another country's tax regime", () => {
    // getCountry() falls back to the default country for DISPLAY. If tax
    // resolution inherited that fallback, a seller in an unmapped country
    // would be silently taxed under Indian GST. Regression guard.
    expect(resolveRegimeId("BR")).toBe("NONE");
    expect(resolveRegimeId("ZZ")).toBe("NONE");
    expect(resolveRegimeId("IN")).toBe("GST_IN");
  });

  it("resolves EU states with no CountryPack to VAT_EU", () => {
    expect(resolveRegimeId("BE")).toBe("VAT_EU");
    expect(resolveRegimeId("PT")).toBe("VAT_EU");
  });

  it("charges no tax for an unmapped country instead of guessing", () => {
    const result = computeTax({
      lines: [line(1000)],
      seller: party("BR"),
      buyer: party("BR"),
    });
    expect(result.totalTax).toBe(0);
    expect(result.total).toBe(1000);
  });
});
