/**
 * Country packs.
 *
 * The UI is English everywhere. Everything numeric, monetary and legal is
 * driven by the tenant's country. Adding a country means adding a row here
 * plus a tax regime implementation -- never a change to a screen.
 *
 * Priority countries for v1: US, IN, GB, AE, EU.
 */

export type TaxRegimeId =
  | "GST_IN"
  | "VAT_GB"
  | "VAT_EU"
  | "VAT_AE"
  | "SALES_TAX_US"
  | "NONE";

export interface CountryPack {
  /** ISO 3166-1 alpha-2 */
  code: string;
  name: string;
  /** BCP 47 locale used for Intl number/date formatting.
   *  en-IN is what produces lakh/crore grouping (1,00,000). */
  locale: string;
  currency: string;
  taxRegime: TaxRegimeId;
  /** What this country calls the tax on an invoice line. */
  taxLabel: string;
  /** What this country calls a business tax identifier. */
  taxIdLabel: string;
  /** Sub-national division, used for place-of-supply and tax sourcing. */
  regionLabel: string;
  /** Whether tax is normally shown inclusive of price on documents. */
  pricesIncludeTax: boolean;
  timeZone: string;
}

export const COUNTRIES: Record<string, CountryPack> = {
  IN: {
    code: "IN",
    name: "India",
    locale: "en-IN",
    currency: "INR",
    taxRegime: "GST_IN",
    taxLabel: "GST",
    taxIdLabel: "GSTIN",
    regionLabel: "State",
    pricesIncludeTax: false,
    timeZone: "Asia/Kolkata",
  },
  US: {
    code: "US",
    name: "United States",
    locale: "en-US",
    currency: "USD",
    taxRegime: "SALES_TAX_US",
    taxLabel: "Sales tax",
    taxIdLabel: "EIN",
    regionLabel: "State",
    pricesIncludeTax: false,
    timeZone: "America/New_York",
  },
  GB: {
    code: "GB",
    name: "United Kingdom",
    locale: "en-GB",
    currency: "GBP",
    taxRegime: "VAT_GB",
    taxLabel: "VAT",
    taxIdLabel: "VAT number",
    regionLabel: "County",
    pricesIncludeTax: true,
    timeZone: "Europe/London",
  },
  AE: {
    code: "AE",
    name: "United Arab Emirates",
    locale: "en-AE",
    currency: "AED",
    taxRegime: "VAT_AE",
    taxLabel: "VAT",
    taxIdLabel: "TRN",
    regionLabel: "Emirate",
    pricesIncludeTax: false,
    timeZone: "Asia/Dubai",
  },
  DE: {
    code: "DE",
    name: "Germany",
    locale: "en-IE",
    currency: "EUR",
    taxRegime: "VAT_EU",
    taxLabel: "VAT",
    taxIdLabel: "VAT ID",
    regionLabel: "State",
    pricesIncludeTax: true,
    timeZone: "Europe/Berlin",
  },
};

export const DEFAULT_COUNTRY = "IN";

export function getCountry(code: string): CountryPack {
  return COUNTRIES[code] ?? COUNTRIES[DEFAULT_COUNTRY];
}

export const COUNTRY_LIST = Object.values(COUNTRIES);
