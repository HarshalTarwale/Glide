import { AppShell } from "@/components/layout/app-shell";
import { getContext } from "@/server/context";
import { isDatabaseConfigured } from "@/lib/db/client";
import { DEFAULT_COUNTRY, getCountry } from "@/lib/i18n/countries";

export default async function AppLayout({ children }: LayoutProps<"/app">) {
  const dbReady = isDatabaseConfigured();
  const ctx = await getContext();

  // Before a database is connected the shell runs in preview mode against the
  // Stage 2 demo data, so the design system stays inspectable. The moment
  // DATABASE_URL points at a real Neon database, this becomes the live session
  // and every screen is tenant-scoped.
  const pack = getCountry(ctx?.country ?? DEFAULT_COUNTRY);

  return (
    <AppShell
      session={{
        userName: ctx?.userName ?? "Preview",
        userEmail: ctx?.userEmail ?? "not signed in",
        tenantName: ctx?.tenantName ?? "Northwind Traders",
        country: ctx?.country ?? DEFAULT_COUNTRY,
        currency: ctx?.currency ?? pack.currency,
        permissions: ctx ? [...ctx.permissions] : null,
        isPreview: !ctx,
        dbReady,
      }}
    >
      {children}
    </AppShell>
  );
}
