import { searchParamsToQuery } from "@/lib/query/record-query";
import { requireContext } from "@/server/context";
import { listJournalEntries } from "@/server/accounting/journal-entries";
import { JournalView } from "./journal-view";

export const metadata = { title: "Journal Entries" };

export default async function JournalEntriesPage({ searchParams }: PageProps<"/app/accounting/journal">) {
  const params = await searchParams;
  const sp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string") sp.set(key, value);
    else if (Array.isArray(value) && value[0]) sp.set(key, value[0]);
  }

  const query = searchParamsToQuery(sp);
  const ctx = await requireContext();
  const page = await listJournalEntries(ctx, query);

  return <JournalView page={page} query={query} />;
}
