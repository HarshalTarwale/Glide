import { requireContext } from "@/server/context";
import { listAccounts } from "@/server/accounting/accounts";
import { NewJournalEntryForm } from "./new-entry-form";

export const metadata = { title: "New journal entry" };

export default async function NewJournalEntryPage() {
  const ctx = await requireContext();
  const accounts = await listAccounts(ctx);
  return <NewJournalEntryForm accounts={accounts.filter((a) => a.isActive)} />;
}
