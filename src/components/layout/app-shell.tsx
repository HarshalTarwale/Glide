"use client";

import * as React from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { FormatProvider } from "@/components/erp/format-context";
import { getCountry, DEFAULT_COUNTRY } from "@/lib/i18n/countries";
import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";
import { CommandPalette } from "./command-palette";

type Density = "comfortable" | "compact";

/**
 * The application frame. Owns the three pieces of chrome state that every
 * screen inherits: sidebar collapse, density, and the tenant's country.
 *
 * In P0 the country comes from the signed-in tenant rather than local state,
 * and density is persisted to user preferences.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = React.useState(false);
  const [density, setDensity] = React.useState<Density>("comfortable");
  const [country, setCountry] = React.useState(DEFAULT_COUNTRY);
  const [paletteOpen, setPaletteOpen] = React.useState(false);

  React.useEffect(() => {
    document.documentElement.dataset.density = density;
  }, [density]);

  const pack = getCountry(country);

  return (
    <TooltipProvider delayDuration={300}>
      <FormatProvider value={{ country, currency: pack.currency }}>
        <div className="flex h-screen overflow-hidden bg-canvas">
          <Sidebar collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} />
          <div className="flex min-w-0 flex-1 flex-col">
            <Topbar
              company="Northwind Traders"
              country={country}
              onCountryChange={setCountry}
              density={density}
              onDensityChange={setDensity}
              onOpenPalette={() => setPaletteOpen(true)}
            />
            <main className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</main>
          </div>
          <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
        </div>
      </FormatProvider>
    </TooltipProvider>
  );
}
