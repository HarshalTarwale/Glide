import { searchParamsToQuery, runQuery } from "@/lib/query/record-query";
import type { RecordPage } from "@/lib/query/record-query";
import { getContext } from "@/server/context";
import { listPartners, type PartnerDTO } from "@/server/core/partners";
import { DEMO_PARTNERS } from "@/lib/mock/partners";
import { ContactsView } from "./contacts-view";

export const metadata = { title: "Contacts" };

/**
 * Server Component, same shape as the inventory list (docs/design-system.md
 * §10): the query runs in Postgres through the DAL, only a page of DTOs
 * crosses to the client. Falls back to demo data with no session.
 */
export default async function ContactsPage({ searchParams }: PageProps<"/app/contacts">) {
  const params = await searchParams;
  const sp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string") sp.set(key, value);
    else if (Array.isArray(value) && value[0]) sp.set(key, value[0]);
  }

  const query = searchParamsToQuery(sp);
  const ctx = await getContext();

  let page: RecordPage<PartnerDTO>;
  let live = false;

  if (ctx) {
    page = await listPartners(ctx, query);
    live = true;
  } else {
    page = runQuery(
      DEMO_PARTNERS as unknown as (PartnerDTO & Record<string, unknown>)[],
      query,
      ["name", "code", "email"]
    );
  }

  return <ContactsView page={page} query={query} live={live} />;
}
