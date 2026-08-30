import { getContext } from "@/server/context";
import { getStockLevels } from "@/server/inventory/stock";
import { getStockFormOptions, type StockFormOptions } from "@/server/inventory/stock-options";
import { DEMO_STOCK_LEVELS } from "@/lib/mock/stock-levels";
import { StockLevelsView } from "./stock-levels-view";

export const metadata = { title: "Stock levels" };

const EMPTY_OPTIONS: StockFormOptions = { products: [], locations: [] };

/**
 * The P2 report screen: on-hand + AVCO value per product, summed across
 * every location, with the low-stock flag from getStockLevels(). Every
 * number here is read straight from the derived report -- see
 * src/server/inventory/stock.ts and tests/stock-ledger.test.ts for the
 * guarantee that it can never silently drift from the move ledger.
 */
export default async function StockLevelsPage() {
  const ctx = await getContext();

  let levels;
  let options = EMPTY_OPTIONS;
  let live = false;

  if (ctx) {
    [levels, options] = await Promise.all([getStockLevels(ctx), getStockFormOptions(ctx)]);
    live = true;
  } else {
    levels = DEMO_STOCK_LEVELS;
  }

  return <StockLevelsView levels={levels} options={options} live={live} />;
}
