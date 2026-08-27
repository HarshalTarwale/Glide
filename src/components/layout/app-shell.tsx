"use client";

import * as React from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { FormatProvider } from "@/components/erp/format-context";
import { SessionProvider, type SessionInfo } from "./session-context";
import { getCountry } from "@/lib/i18n/countries";
import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";
import { CommandPalette } from "./command-palette";
import { PreviewBanner } from "./preview-banner";

type Density = "comfortable" | "compact";

/**
 * The application frame. Owns the chrome state every screen inherits:
 * sidebar collapse, density, and the active country.
 *
 * Identity and permissions come from the server (src/server/context.ts) and
 * are passed in — this component never fetches them.
 */
export function AppShell({
  session,
  children,
}: {
  session: SessionInfo;
  children: React.ReactNode;
}) {
  const [collapsed, setCollapsed] = React.useState(false);
  const [density, setDensity] = React.useState<Density>("comfortable");
  // In preview mode the country switcher is a live demo of the localization
  // layer. With a real session it reflects the tenant's configured country.
  const [country, setCountry] = React.useState(session.country);
  const [paletteOpen, setPaletteOpen] = React.useState(false);

  React.useEffect(() => {
    document.documentElement.dataset.density = density;
  }, [density]);

  const pack = getCountry(country);

  return (
    <SessionProvider value={session}>
      <TooltipProvider delayDuration={300}>
        <FormatProvider value={{ country, currency: pack.currency }}>
          <div className="flex h-screen overflow-hidden bg-canvas">
            <Sidebar collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} />
            <div className="flex min-w-0 flex-1 flex-col">
              <Topbar
                company={session.tenantName}
                userName={session.userName}
                userEmail={session.userEmail}
                country={country}
                onCountryChange={setCountry}
                density={density}
                onDensityChange={setDensity}
                onOpenPalette={() => setPaletteOpen(true)}
              />
              {session.isPreview ? <PreviewBanner dbReady={session.dbReady} /> : null}
              <main className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</main>
            </div>
            <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
          </div>
        </FormatProvider>
      </TooltipProvider>
    </SessionProvider>
  );
}
