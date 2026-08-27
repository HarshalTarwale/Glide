"use client";

import { Info } from "lucide-react";
import { Money } from "./money";
import { useFormatContext } from "./format-context";
import { Badge } from "@/components/ui/badge";
import { computeTax, resolveRegimeId } from "@/lib/tax";
import { getCountry } from "@/lib/i18n/countries";

/**
 * Shows the tax engine working against the tenant's live country, so the
 * behaviour is inspectable in the product rather than only in tests.
 *
 * For India it renders the intra-state (CGST + SGST) and inter-state (IGST)
 * cases side by side, because that split is the single rule most likely to be
 * implemented wrongly and the one an Indian accountant checks first.
 */
export function TaxPreview({ amount = 100000 }: { amount?: number }) {
  const ctx = useFormatContext();
  const pack = getCountry(ctx.country);
  const regimeId = resolveRegimeId(ctx.country);

  const region = pack.code === "IN" ? "Maharashtra" : pack.code === "AE" ? "Dubai" : "California";
  const otherRegion = pack.code === "IN" ? "Karnataka" : "Texas";

  const scenarios: { label: string; buyerRegion?: string }[] =
    regimeId === "GST_IN"
      ? [
          { label: `Within ${region}`, buyerRegion: region },
          { label: `To ${otherRegion}`, buyerRegion: otherRegion },
        ]
      : [{ label: "Domestic sale", buyerRegion: region }];

  const rates =
    regimeId === "SALES_TAX_US"
      ? [
          { name: "CA State", rate: 6, level: "state" as const, region: "California" },
          { name: "LA County", rate: 0.25, level: "county" as const, region: "Los Angeles" },
          { name: "LA City", rate: 1, level: "city" as const, region: "Los Angeles" },
        ]
      : undefined;

  return (
    <div className="space-y-3">
      {scenarios.map((scenario) => {
        let result;
        try {
          result = computeTax({
            lines: [{ id: "l1", amount, category: "standard" }],
            seller: { address: { country: pack.code, region } },
            buyer: {
              address: {
                country: pack.code,
                region: scenario.buyerRegion,
                city: regimeId === "SALES_TAX_US" ? "Los Angeles" : undefined,
              },
            },
            settings: rates ? { rates } : undefined,
          });
        } catch {
          return null;
        }

        return (
          <div key={scenario.label} className="rounded-md border border-hairline">
            <div className="flex items-center justify-between border-b border-hairline bg-surface-sunken px-3 py-1.5">
              <span className="text-2xs font-semibold uppercase tracking-wide text-ink-subtle">
                {scenario.label}
              </span>
              <Badge tone="neutral">{regimeId}</Badge>
            </div>
            <dl className="space-y-1 px-3 py-2.5 text-sm">
              <div className="flex justify-between">
                <dt className="text-ink-muted">Taxable value</dt>
                <dd>
                  <Money value={result.subtotal} />
                </dd>
              </div>
              {result.components.map((c) => (
                <div key={c.label} className="flex justify-between">
                  <dt className="text-ink-muted">{c.label}</dt>
                  <dd>
                    <Money value={c.amount} />
                  </dd>
                </div>
              ))}
              <div className="flex justify-between border-t border-hairline pt-1 font-semibold">
                <dt>Total</dt>
                <dd>
                  <Money value={result.total} />
                </dd>
              </div>
            </dl>
            {result.notes.length > 0 ? (
              <p className="flex items-start gap-1.5 border-t border-hairline px-3 py-2 text-2xs text-ink-subtle">
                <Info className="mt-px size-3 shrink-0" />
                {result.notes[0]}
              </p>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
