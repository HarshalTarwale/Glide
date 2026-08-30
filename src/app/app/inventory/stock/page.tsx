import { getContext } from "@/server/context";
import { getStockLevels } from "@/server/inventory/stock";
import { getStockFormOptions, type StockFormOptions } from "@/server/inventory/stock-options";
import { listLots, type LotDTO } from "@/server/inventory/lots";
import { listReorderRules, type ReorderRuleDTO } from "@/server/inventory/reorder-rules";
import { DEMO_STOCK_LEVELS } from "@/lib/mock/stock-levels";
import { StockPageView } from "./stock-page-view";

export const metadata = { title: "Stock levels" };

const EMPTY_OPTIONS: StockFormOptions = { products: [], locations: [], warehouses: [] };

/**
 * The P2 report screen, three tabs: on-hand levels, lot/serial traceability,
 * per-warehouse reorder thresholds. Every number is read straight from the
 * move ledger or its derived caches -- see src/server/inventory/stock.ts and
 * tests/stock-ledger.test.ts for the guarantee that none of it can silently
 * drift.
 */
export default async function StockPage() {
  const ctx = await getContext();

  let levels;
  let lots: LotDTO[] = [];
  let reorderRules: ReorderRuleDTO[] = [];
  let options = EMPTY_OPTIONS;
  let live = false;

  if (ctx) {
    [levels, lots, reorderRules, options] = await Promise.all([
      getStockLevels(ctx),
      listLots(ctx),
      listReorderRules(ctx),
      getStockFormOptions(ctx),
    ]);
    live = true;
  } else {
    levels = DEMO_STOCK_LEVELS;
  }

  return <StockPageView levels={levels} lots={lots} reorderRules={reorderRules} options={options} live={live} />;
}
