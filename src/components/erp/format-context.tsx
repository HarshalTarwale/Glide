"use client";

import * as React from "react";
import type { FormatContext } from "@/lib/format";
import { DEFAULT_COUNTRY } from "@/lib/i18n/countries";

/**
 * Carries the active tenant's country/currency down the tree so that
 * every Money, Quantity and Date renders in the right locale without
 * threading props through every screen.
 */
const Ctx = React.createContext<FormatContext>({ country: DEFAULT_COUNTRY });

export function FormatProvider({
  value,
  children,
}: {
  value: FormatContext;
  children: React.ReactNode;
}) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useFormatContext() {
  return React.useContext(Ctx);
}
