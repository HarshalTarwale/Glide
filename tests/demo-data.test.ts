import { describe, expect, it } from "vitest";
import { signup } from "@/server/core/signup";
import { withTenant } from "@/lib/db/tenant-client";

/**
 * Creates a real, persistent demo account to click through in the browser.
 *
 * Deliberately NOT part of the normal suite — it leaves data behind, whereas
 * every other DB test cleans up after itself. Run it explicitly:
 *
 *   npx vitest run tests/demo-data.test.ts
 *
 * Safe to re-run: the email is fixed, so a second run finds the account
 * already exists and leaves it untouched rather than duplicating it.
 */

const DEMO_EMAIL = "demo@glide.app";
const DEMO_PASSWORD = "demo12345";

const hasDatabase =
  Boolean(process.env.DATABASE_URL) && !process.env.DATABASE_URL?.includes("placeholder");

// Skipped by default. Unlike every other DB test, this one deliberately leaves
// data behind, so it must be asked for explicitly:  npm run db:demo
const enabled = hasDatabase && process.env.SEED_DEMO === "1";
const describeWithDb = enabled ? describe : describe.skip;

const CATALOG = [
  { sku: "BRG-6204ZZ", name: "Industrial Bearing 6204-ZZ", price: "340.00", cost: "215.00", uom: "pcs", hsn: "8482", reorder: "50" },
  { sku: "BLT-A42HD", name: "Drive Belt A-42 Heavy Duty", price: "615.00", cost: "410.00", uom: "pcs", hsn: "4010", reorder: "30" },
  { sku: "MTR-1HP-3P", name: "Induction Motor 1HP 3-Phase", price: "8450.00", cost: "6100.00", uom: "pcs", hsn: "8501", reorder: "5" },
  { sku: "LUB-EP2-5K", name: "EP2 Lithium Grease 5kg", price: "1250.00", cost: "870.00", uom: "kg", hsn: "2710", reorder: "20" },
  { sku: "CBL-4C-25M", name: "Armoured Cable 4-Core 25m", price: "4320.00", cost: "3150.00", uom: "m", hsn: "8544", reorder: "10" },
  { sku: "VLV-BALL-2", name: 'Ball Valve 2" Brass', price: "1890.00", cost: "1240.00", uom: "pcs", hsn: "8481", reorder: "25" },
  { sku: "SVC-INSTALL", name: "On-site Installation (per hour)", price: "1500.00", cost: "0.00", uom: "hr", hsn: "9987", reorder: null },
  { sku: "FLT-HYD-10", name: "Hydraulic Filter 10 Micron", price: "2100.00", cost: "1480.00", uom: "pcs", hsn: "8421", reorder: "15" },
];

const PARTNERS = [
  { code: "ACME", name: "Acme Industrial Supplies", isCustomer: true, isSupplier: false, city: "Mumbai", region: "Maharashtra", gstin: "27AABCU9603R1ZX" },
  { code: "NEXA", name: "Nexa Retail Pvt Ltd", isCustomer: true, isSupplier: false, city: "Pune", region: "Maharashtra", gstin: "27AAGCN1234M1Z5" },
  { code: "VERTEX", name: "Vertex Manufacturing", isCustomer: true, isSupplier: false, city: "Chennai", region: "Tamil Nadu", gstin: "33AABCV5678K1ZP" },
  { code: "ORBIT", name: "Orbit Logistics", isCustomer: true, isSupplier: true, city: "Bengaluru", region: "Karnataka", gstin: "29AAECO9012L1ZQ" },
  { code: "STERLING", name: "Sterling Components", isCustomer: false, isSupplier: true, city: "Ahmedabad", region: "Gujarat", gstin: "24AAFCS3456N1ZR" },
];

describeWithDb("demo data", () => {
  it("creates a signed-in-able demo tenant with a real catalogue", async () => {
    const result = await signup({
      name: "Demo User",
      email: DEMO_EMAIL,
      password: DEMO_PASSWORD,
      organisation: "Northwind Traders",
      country: "IN",
    });

    if (!result.ok) {
      // Already created by a previous run. Nothing to do.
      expect(result.error).toContain("already exists");
      console.log(`\n  Demo account already exists: ${DEMO_EMAIL} / ${DEMO_PASSWORD}\n`);
      return;
    }

    const counts = await withTenant(result.tenantId, async (tx) => {
      const uoms = await tx.unitOfMeasure.findMany({
        where: { tenantId: result.tenantId },
        select: { id: true, code: true },
      });
      const uomByCode = new Map(uoms.map((u) => [u.code, u.id]));

      const standard = await tx.taxCategory.findFirstOrThrow({
        where: { tenantId: result.tenantId, key: "standard" },
        select: { id: true },
      });

      const category = await tx.productCategory.create({
        data: { tenantId: result.tenantId, name: "Industrial Parts" },
        select: { id: true },
      });

      await tx.product.createMany({
        data: CATALOG.map((p) => ({
          tenantId: result.tenantId,
          sku: p.sku,
          name: p.name,
          type: p.sku.startsWith("SVC-") ? ("service" as const) : ("goods" as const),
          uomId: uomByCode.get(p.uom) ?? uomByCode.get("pcs")!,
          categoryId: p.sku.startsWith("SVC-") ? null : category.id,
          taxCategoryId: standard.id,
          salesPrice: p.price,
          costPrice: p.cost,
          hsnCode: p.hsn,
          reorderPoint: p.reorder,
        })),
      });

      for (const partner of PARTNERS) {
        const created = await tx.partner.create({
          data: {
            tenantId: result.tenantId,
            code: partner.code,
            name: partner.name,
            isCustomer: partner.isCustomer,
            isSupplier: partner.isSupplier,
            currency: "INR",
            paymentTermDays: 30,
          },
          select: { id: true },
        });
        await tx.partnerAddress.create({
          data: {
            tenantId: result.tenantId,
            partnerId: created.id,
            kind: "billing",
            isDefault: true,
            line1: `${partner.city} Industrial Estate`,
            city: partner.city,
            region: partner.region,
            country: "IN",
          },
        });
        await tx.partnerTaxInfo.create({
          data: {
            tenantId: result.tenantId,
            partnerId: created.id,
            country: "IN",
            taxId: partner.gstin,
            region: partner.region,
            isRegistered: true,
          },
        });
      }

      return {
        products: await tx.product.count({ where: { tenantId: result.tenantId } }),
        partners: await tx.partner.count({ where: { tenantId: result.tenantId } }),
      };
    });

    expect(counts.products).toBe(CATALOG.length);
    expect(counts.partners).toBe(PARTNERS.length);

    console.log(
      `\n  Demo account ready\n` +
        `    email:    ${DEMO_EMAIL}\n` +
        `    password: ${DEMO_PASSWORD}\n` +
        `    org:      Northwind Traders (India / INR / GST)\n` +
        `    seeded:   ${counts.products} products, ${counts.partners} partners\n`
    );
  });
});
