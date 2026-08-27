/**
 * The tax engine contract.
 *
 * One pure function per regime. A new country is a new implementation of
 * TaxRegime plus a CountryPack row — never a change to invoicing, sales, or
 * any screen. See docs/architecture.md §4.1.
 *
 * Everything here is deliberately dependency-free and synchronous so the
 * golden-case suite can exercise it without a database.
 */

export type TaxRegimeId =
  | "GST_IN"
  | "VAT_GB"
  | "VAT_EU"
  | "VAT_AE"
  | "SALES_TAX_US"
  | "NONE";

/** Which tax band a product falls into. */
export type TaxCategoryKey = "standard" | "reduced" | "zero" | "exempt";

export interface TaxAddress {
  country: string;
  /** State / county / emirate. Drives place of supply and US sourcing. */
  region?: string;
  city?: string;
  postalCode?: string;
}

export interface TaxParty {
  address: TaxAddress;
  /** GSTIN / VAT number / TRN. Absence usually means "unregistered". */
  taxId?: string;
  isRegistered?: boolean;
  /** US resale/exemption certificate on file. */
  exemptionCertificate?: string;
  /** UAE designated zone, which is outside the scope of VAT. */
  inDesignatedZone?: boolean;
}

export interface TaxableLine {
  id: string;
  /** Quantity x unit price, already net of any line discount. */
  amount: number;
  category: TaxCategoryKey;
  /** Services vs goods changes place-of-supply in several regimes. */
  isService?: boolean;
}

/** A configured jurisdiction rate. US stacks several; others resolve to one. */
export interface JurisdictionRate {
  name: string;
  rate: number;
  level: "national" | "state" | "county" | "city";
  region?: string;
  category?: TaxCategoryKey;
}

export interface TaxSettings {
  /** Rates configured by the tenant. Required for US; optional elsewhere. */
  rates?: JurisdictionRate[];
  /** Prices already include tax and must be back-computed. */
  pricesIncludeTax?: boolean;
  /** Round per line, or once on the document total. */
  rounding?: "line" | "document";
}

/** One row of the tax summary shown on a document. */
export interface TaxComponent {
  /** Display label, e.g. "CGST 9%" or "VAT 20%". */
  label: string;
  rate: number;
  /** Sum of line amounts this component applied to. */
  taxableAmount: number;
  amount: number;
  /** Machine key for reporting: "CGST" | "SGST" | "IGST" | "VAT" | "SALES_TAX". */
  kind: string;
}

export interface TaxResult {
  components: TaxComponent[];
  /** Net of tax. */
  subtotal: number;
  totalTax: number;
  total: number;
  /** Why zero tax was charged, when it was. Printed on the invoice. */
  notes: string[];
  /** Buyer accounts for the tax instead of the seller. */
  reverseCharge: boolean;
}

export interface TaxInput {
  lines: TaxableLine[];
  seller: TaxParty;
  buyer: TaxParty;
  settings?: TaxSettings;
}

export interface TaxRegime {
  id: TaxRegimeId;
  label: string;
  compute(input: TaxInput): TaxResult;
}

/**
 * Money rounding. Half-up at 2dp by default.
 *
 * Deliberately explicit rather than relying on toFixed: toFixed uses the
 * binary representation and rounds 1.005 to "1.00", which is exactly the
 * class of one-paisa discrepancy an accountant will find and report.
 */
export function round(value: number, decimals = 2): number {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

export function sum(values: number[]): number {
  return values.reduce((a, b) => a + b, 0);
}
