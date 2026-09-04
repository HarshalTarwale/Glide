import { requireContext } from "@/server/context";
import { listAccounts } from "@/server/accounting/accounts";
import { AccountsView } from "./accounts-view";

export const metadata = { title: "Chart of Accounts" };

export default async function AccountsPage() {
  const ctx = await requireContext();
  const accounts = await listAccounts(ctx);
  return <AccountsView accounts={accounts} />;
}
