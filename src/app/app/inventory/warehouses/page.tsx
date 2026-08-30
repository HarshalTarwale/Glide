import { searchParamsToQuery, runQuery } from "@/lib/query/record-query";
import type { RecordPage } from "@/lib/query/record-query";
import { getContext } from "@/server/context";
import { listWarehouses, type WarehouseDTO } from "@/server/inventory/warehouses";
import { WarehousesView } from "./warehouses-view";

export const metadata = { title: "Warehouses" };

const DEMO_WAREHOUSES: WarehouseDTO[] = [
  {
    id: "wh_demo_1",
    code: "MAIN",
    name: "Main Warehouse",
    addressLine1: null,
    city: "Mumbai",
    region: "Maharashtra",
    postalCode: null,
    country: "IN",
    isActive: true,
    locationCount: 1,
  },
];

/**
 * Server Component, same shape as every other list in the app. Small on
 * purpose in P1 -- see src/server/inventory/warehouses.ts for what P2 adds.
 */
export default async function WarehousesPage({
  searchParams,
}: PageProps<"/app/inventory/warehouses">) {
  const params = await searchParams;
  const sp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string") sp.set(key, value);
    else if (Array.isArray(value) && value[0]) sp.set(key, value[0]);
  }

  const query = searchParamsToQuery(sp);
  const ctx = await getContext();

  let page: RecordPage<WarehouseDTO>;
  let live = false;

  if (ctx) {
    page = await listWarehouses(ctx, query);
    live = true;
  } else {
    page = runQuery(DEMO_WAREHOUSES as unknown as (WarehouseDTO & Record<string, unknown>)[], query, ["name", "code"]);
  }

  return <WarehousesView page={page} query={query} live={live} />;
}
