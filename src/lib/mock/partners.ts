import type { PartnerDTO } from "@/server/core/partners";

/**
 * Demo contacts for preview mode. Same role as src/lib/mock/products.ts:
 * read when there is no session, deleted once real data exists.
 */
const NAMES: [string, string, boolean, boolean, string, string][] = [
  ["Acme Industrial Supplies", "ACME", true, false, "Mumbai", "Maharashtra"],
  ["Nexa Retail Pvt Ltd", "NEXA", true, false, "Pune", "Maharashtra"],
  ["Vertex Manufacturing", "VERTEX", true, false, "Chennai", "Tamil Nadu"],
  ["Orbit Logistics", "ORBIT", true, true, "Bengaluru", "Karnataka"],
  ["Kite & Co Trading", "KITE", true, false, "Delhi", "Delhi"],
  ["Meridian Foods", "MERIDIAN", true, false, "Hyderabad", "Telangana"],
  ["Sterling Components", "STERLING", false, true, "Ahmedabad", "Gujarat"],
  ["Pinnacle Distribution", "PINNACLE", true, false, "Kolkata", "West Bengal"],
];

export const DEMO_PARTNERS: PartnerDTO[] = NAMES.map(([name, code, isCustomer, isSupplier, city, region], i) => ({
  id: `ptn_${1000 + i}`,
  code,
  name,
  kind: "company",
  isCustomer,
  isSupplier,
  email: `contact@${code.toLowerCase()}.example.com`,
  phone: "+91 98765 43210",
  currency: "INR",
  paymentTermDays: 30,
  creditLimit: null,
  notes: null,
  isActive: true,
  billingLine1: `${city} Industrial Estate`,
  billingCity: city,
  billingRegion: region,
  billingCountry: "IN",
  taxId: `27${code.padEnd(10, "X")}1Z${i}`,
  taxIdCountry: "IN",
}));
