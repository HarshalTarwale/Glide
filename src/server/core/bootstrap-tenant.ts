import "server-only";

import type { TenantTransaction } from "@/lib/db/tenant-client";
import { getCountry } from "@/lib/i18n/countries";
import type { TaxCategoryKey } from "@/lib/tax";
import { bootstrapAccounting } from "@/server/accounting/accounting-bootstrap";

/**
 * Essential master data every new tenant needs before the product is usable.
 *
 * This is not demo content — it is required. `Product.uomId` is a non-null
 * foreign key, so without at least one UnitOfMeasure a tenant physically
 * cannot create a single product. The same is true, less absolutely, of tax
 * categories (the tax engine resolves rates by category key) and of a stock
 * location (P2's move ledger is location-to-location, never a bare quantity).
 *
 * Runs inside the caller's tenant transaction, so every insert satisfies its
 * own RLS WITH CHECK. See signup.ts for why that works without any bypass.
 */

/** Units, grouped by category, with the reference unit factor 1. */
const UNITS: {
  code: string;
  name: string;
  category: string;
  factor: number;
  isReference: boolean;
  precision: number;
}[] = [
  { code: "unit", name: "Units", category: "unit", factor: 1, isReference: true, precision: 0 },
  { code: "pcs", name: "Pieces", category: "unit", factor: 1, isReference: false, precision: 0 },
  { code: "box", name: "Box of 12", category: "unit", factor: 12, isReference: false, precision: 0 },
  { code: "kg", name: "Kilograms", category: "weight", factor: 1, isReference: true, precision: 3 },
  { code: "g", name: "Grams", category: "weight", factor: 0.001, isReference: false, precision: 0 },
  { code: "l", name: "Litres", category: "volume", factor: 1, isReference: true, precision: 3 },
  { code: "m", name: "Metres", category: "length", factor: 1, isReference: true, precision: 2 },
  { code: "hr", name: "Hours", category: "time", factor: 1, isReference: true, precision: 2 },
];

const TAX_CATEGORIES: { key: TaxCategoryKey; name: string }[] = [
  { key: "standard", name: "Standard rate" },
  { key: "reduced", name: "Reduced rate" },
  { key: "zero", name: "Zero-rated" },
  { key: "exempt", name: "Exempt" },
];

/**
 * Default statutory rates per country, by tax category.
 *
 * These are starting values a tenant is expected to review, not legal advice
 * — rates change, and a tenant may be on a special scheme. They exist so the
 * tax engine returns something sensible on day one rather than zero.
 *
 * US is deliberately empty: American sales tax is a per-jurisdiction stack
 * (state + county + city) that depends on where the seller has nexus, and
 * there is no single national rate to default to. A US tenant configures
 * their own jurisdictions. This is the documented v1 scope boundary in
 * docs/architecture.md §4.2.
 */
const DEFAULT_RATES: Record<
  string,
  { name: string; rate: number; category: TaxCategoryKey; level: "national" | "state" }[]
> = {
  IN: [
    { name: "GST 18%", rate: 18, category: "standard", level: "national" },
    { name: "GST 5%", rate: 5, category: "reduced", level: "national" },
    { name: "GST 0%", rate: 0, category: "zero", level: "national" },
  ],
  GB: [
    { name: "VAT 20%", rate: 20, category: "standard", level: "national" },
    { name: "VAT 5%", rate: 5, category: "reduced", level: "national" },
    { name: "VAT 0%", rate: 0, category: "zero", level: "national" },
  ],
  AE: [
    { name: "VAT 5%", rate: 5, category: "standard", level: "national" },
    { name: "VAT 0%", rate: 0, category: "zero", level: "national" },
  ],
  DE: [
    { name: "VAT 19%", rate: 19, category: "standard", level: "national" },
    { name: "VAT 7%", rate: 7, category: "reduced", level: "national" },
    { name: "VAT 0%", rate: 0, category: "zero", level: "national" },
  ],
  US: [],
};

export interface BootstrapResult {
  uomCount: number;
  taxCategoryCount: number;
  taxRateCount: number;
  warehouseId: string;
}

export async function bootstrapTenant(
  tx: TenantTransaction,
  tenantId: string,
  companyId: string,
  countryCode: string
): Promise<BootstrapResult> {
  const pack = getCountry(countryCode);

  // --- Units of measure -------------------------------------------------
  await tx.unitOfMeasure.createMany({
    data: UNITS.map((u) => ({ ...u, tenantId })),
  });

  // --- Tax categories ---------------------------------------------------
  await tx.taxCategory.createMany({
    data: TAX_CATEGORIES.map((c) => ({ tenantId, key: c.key, name: c.name })),
  });

  const categories = await tx.taxCategory.findMany({
    where: { tenantId },
    select: { id: true, key: true },
  });
  const categoryIdByKey = new Map(categories.map((c) => [c.key, c.id]));

  // --- Tax rates for the tenant's country -------------------------------
  const rates = DEFAULT_RATES[pack.code] ?? [];
  if (rates.length > 0) {
    await tx.taxRate.createMany({
      data: rates.map((r) => ({
        tenantId,
        name: r.name,
        country: pack.code,
        rate: r.rate,
        level: r.level,
        taxCategoryId: categoryIdByKey.get(r.category) ?? null,
        isActive: true,
      })),
    });
  }

  // --- Default price list, in the tenant's own currency -----------------
  await tx.priceList.create({
    data: {
      tenantId,
      name: "Default",
      currency: pack.currency,
      isDefault: true,
    },
  });

  // --- Warehouse and the locations P2's move ledger will need -----------
  const warehouse = await tx.warehouse.create({
    data: {
      tenantId,
      companyId,
      code: "MAIN",
      name: "Main Warehouse",
      country: pack.code,
    },
    select: { id: true },
  });

  await tx.location.createMany({
    data: [
      // Internal: real stock the tenant owns. Counts toward on-hand.
      { tenantId, warehouseId: warehouse.id, kind: "internal", code: "MAIN/STOCK", name: "Stock" },
      // External counterparties. Every receipt and delivery has one of these
      // on the other side, so the ledger always balances.
      { tenantId, kind: "external", code: "SUPPLIERS", name: "Suppliers" },
      { tenantId, kind: "external", code: "CUSTOMERS", name: "Customers" },
      // Balancing location for stock adjustments, so a correction is still a
      // two-sided move rather than an unexplained quantity change.
      { tenantId, kind: "adjustment", code: "ADJUST", name: "Inventory Adjustment" },
      // Virtual counterparty for manufacturing (P6+): components leave real
      // stock into here, the finished good leaves here into real stock.
      { tenantId, kind: "production", code: "PRODUCTION", name: "Production" },
    ],
  });

  // --- Chart of accounts, so the GL can post from the tenant's first day -
  await bootstrapAccounting(tx, tenantId, companyId);

  return {
    uomCount: UNITS.length,
    taxCategoryCount: TAX_CATEGORIES.length,
    taxRateCount: rates.length,
    warehouseId: warehouse.id,
  };
}
