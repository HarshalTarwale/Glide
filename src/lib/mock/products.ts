import type { ProductDTO } from "@/server/catalog/products";

/**
 * Demo catalog for preview mode. Deleted once a real database is connected
 * and seeded — the Products screen reads the DAL when a session exists and
 * falls back to this only when it does not.
 */

const NAMES: [string, string, string, number, string][] = [
  ["BRG-6204ZZ", "Industrial Bearing 6204-ZZ", "Bearings", 340, "84821011"],
  ["BRG-6205ZZ", "Industrial Bearing 6205-ZZ", "Bearings", 395, "84821011"],
  ["BLT-A42HD", "Drive Belt A-42 Heavy Duty", "Belts & Chains", 615, "40103990"],
  ["BLT-B56", "Drive Belt B-56", "Belts & Chains", 720, "40103990"],
  ["CHN-08B1", "Roller Chain 08B-1 (5m)", "Belts & Chains", 1250, "73151100"],
  ["MTR-1HP", "Induction Motor 1 HP", "Motors", 8400, "85015210"],
  ["MTR-2HP", "Induction Motor 2 HP", "Motors", 12900, "85015210"],
  ["GRB-30T", "Gearbox Reducer 1:30", "Power Transmission", 18500, "84834000"],
  ["CPL-L095", "Jaw Coupling L095", "Power Transmission", 890, "84836090"],
  ["SEL-2540", "Oil Seal 25x40x7", "Seals", 65, "40169350"],
  ["SEL-3552", "Oil Seal 35x52x7", "Seals", 82, "40169350"],
  ["LUB-EP2", "Grease EP-2 (1 kg)", "Lubricants", 410, "27101980"],
  ["LUB-ISO68", "Hydraulic Oil ISO 68 (20 L)", "Lubricants", 3200, "27101980"],
  ["BOL-M12", "Hex Bolt M12x50 (100 pcs)", "Fasteners", 540, "73181500"],
  ["NUT-M12", "Hex Nut M12 (200 pcs)", "Fasteners", 310, "73181600"],
  ["WSH-M12", "Washer M12 (500 pcs)", "Fasteners", 180, "73182200"],
  ["VLV-BALL1", "Ball Valve 1 inch SS", "Valves", 1450, "84818030"],
  ["VLV-GATE2", "Gate Valve 2 inch CI", "Valves", 2380, "84818020"],
  ["PMP-CF15", "Centrifugal Pump 1.5 HP", "Pumps", 15600, "84137010"],
  ["FLT-HYD10", "Hydraulic Filter 10 micron", "Filters", 1180, "84212300"],
];

const SERVICES: [string, string, number][] = [
  ["SVC-INSTALL", "On-site Installation", 4500],
  ["SVC-AMC", "Annual Maintenance Contract", 24000],
  ["SVC-CALIB", "Calibration Service", 3200],
];

export const DEMO_PRODUCTS: ProductDTO[] = [
  ...NAMES.map(([sku, name, category, price, hsn], i) => ({
    id: `prd_${1000 + i}`,
    sku,
    name,
    type: "goods" as const,
    categoryName: category,
    uomCode: "pcs",
    salesPrice: price,
    costPrice: Math.round(price * 0.62 * 100) / 100,
    taxCategoryKey: "standard",
    hsnCode: hsn,
    tracking: (i % 7 === 0 ? "lot" : "none") as ProductDTO["tracking"],
    isActive: i % 11 !== 0,
    isSellable: true,
  })),
  ...SERVICES.map(([sku, name, price], i) => ({
    id: `svc_${2000 + i}`,
    sku,
    name,
    type: "service" as const,
    categoryName: "Services",
    uomCode: "hr",
    salesPrice: price,
    costPrice: Math.round(price * 0.4 * 100) / 100,
    taxCategoryKey: "standard",
    hsnCode: "998719",
    tracking: "none" as const,
    isActive: true,
    isSellable: true,
  })),
];
