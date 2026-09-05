import { requireContext } from "@/server/context";
import { listBoms } from "@/server/manufacturing/boms";
import { getManufacturingFormOptions } from "@/server/manufacturing/options";
import { BomsView } from "./boms-view";

export const metadata = { title: "Bills of Materials" };

export default async function BomsPage() {
  const ctx = await requireContext();
  const [boms, options] = await Promise.all([listBoms(ctx), getManufacturingFormOptions(ctx)]);
  return <BomsView boms={boms} products={options.products} />;
}
