import { notFound } from "next/navigation";
import { requireContext } from "@/server/context";
import { getJournalEntry } from "@/server/accounting/journal-entries";
import { EntryView } from "./entry-view";

export default async function JournalEntryPage({ params }: PageProps<"/app/accounting/journal/[id]">) {
  const { id } = await params;
  const ctx = await requireContext();
  const entry = await getJournalEntry(ctx, id);
  if (!entry) notFound();

  return <EntryView entry={entry} />;
}
