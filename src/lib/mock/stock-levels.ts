import type { StockLevelDTO } from "@/server/inventory/stock";

/** Demo stock levels for preview mode, same role as the other mock/*.ts files. */
export const DEMO_STOCK_LEVELS: StockLevelDTO[] = [
  { productId: "prd_1000", sku: "BRG-6204ZZ", name: "Industrial Bearing 6204-ZZ", uomCode: "pcs", onHand: 240, averageCost: 215, value: 51600, reorderPoint: 50, isLow: false },
  { productId: "prd_1002", sku: "BLT-A42HD", name: "Drive Belt A-42 Heavy Duty", uomCode: "pcs", onHand: 18, averageCost: 410, value: 7380, reorderPoint: 30, isLow: true },
  { productId: "prd_1005", sku: "MTR-1HP", name: "Induction Motor 1 HP", uomCode: "pcs", onHand: 4, averageCost: 6100, value: 24400, reorderPoint: 5, isLow: true },
  { productId: "prd_1011", sku: "LUB-EP2", name: "Grease EP-2 (1 kg)", uomCode: "kg", onHand: 62, averageCost: 285, value: 17670, reorderPoint: 20, isLow: false },
  { productId: "prd_1019", sku: "FLT-HYD10", name: "Hydraulic Filter 10 micron", uomCode: "pcs", onHand: 33, averageCost: 780, value: 25740, reorderPoint: 15, isLow: false },
];
