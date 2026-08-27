import { searchParamsToQuery } from "@/lib/query/record-query";
import { runQuery } from "@/lib/query/record-query";
import { getContext } from "@/server/context";
import { listProducts, type ProductDTO } from "@/server/catalog/products";
import { DEMO_PRODUCTS } from "@/lib/mock/products";
import type { RecordPage } from "@/lib/query/record-query";
import { ProductsView } from "./products-view";

export const metadata = { title: "Products" };

/**
 * A SERVER component. The query runs in Postgres through the DAL, and only a
 * page of DTOs crosses to the client — the Stage 2 gap where the list was a
 * client component reading useSearchParams is closed here.
 *
 * Without a session it falls back to the in-memory demo catalog, evaluated by
 * the client-side twin of the same RecordQuery. Identical semantics, so the
 * screen behaves the same either way.
 */
export default async function ProductsPage({ searchParams }: PageProps<"/app/inventory">) {
  const params = await searchParams;
  const sp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string") sp.set(key, value);
    else if (Array.isArray(value) && value[0]) sp.set(key, value[0]);
  }

  const query = searchParamsToQuery(sp);
  const ctx = await getContext();

  let page: RecordPage<ProductDTO>;
  let live = false;

  if (ctx) {
    page = await listProducts(ctx, query);
    live = true;
  } else {
    page = runQuery(
      DEMO_PRODUCTS as unknown as (ProductDTO & Record<string, unknown>)[],
      query,
      ["name", "sku"]
    );
  }

  return <ProductsView page={page} query={query} live={live} />;
}
