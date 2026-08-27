import { getCountry } from "./i18n/countries";

/**
 * All display formatting goes through here so a tenant in India sees
 * Rs 1,00,000.00 and a tenant in the US sees $100,000.00 from the same
 * stored value. Nothing in a component should call Intl directly.
 */

export interface FormatContext {
  /** ISO country code of the tenant/company. */
  country: string;
  /** Optional override; defaults to the country's currency. */
  currency?: string;
}

export function formatMoney(
  amount: number,
  ctx: FormatContext,
  opts: { compact?: boolean; showCurrency?: boolean } = {}
) {
  const pack = getCountry(ctx.country);
  const currency = ctx.currency ?? pack.currency;
  return new Intl.NumberFormat(pack.locale, {
    style: opts.showCurrency === false ? "decimal" : "currency",
    currency,
    notation: opts.compact ? "compact" : "standard",
    minimumFractionDigits: opts.compact ? 0 : 2,
    maximumFractionDigits: opts.compact ? 1 : 2,
  }).format(amount);
}

export function formatQuantity(qty: number, ctx: FormatContext, uom?: string) {
  const pack = getCountry(ctx.country);
  const n = new Intl.NumberFormat(pack.locale, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3,
  }).format(qty);
  return uom ? `${n} ${uom}` : n;
}

export function formatNumber(value: number, ctx: FormatContext) {
  return new Intl.NumberFormat(getCountry(ctx.country).locale).format(value);
}

export function formatPercent(value: number, ctx: FormatContext) {
  return new Intl.NumberFormat(getCountry(ctx.country).locale, {
    style: "percent",
    maximumFractionDigits: 2,
  }).format(value / 100);
}

export function formatDate(date: Date | string, ctx: FormatContext) {
  const pack = getCountry(ctx.country);
  return new Intl.DateTimeFormat(pack.locale, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: pack.timeZone,
  }).format(typeof date === "string" ? new Date(date) : date);
}

export function formatDateTime(date: Date | string, ctx: FormatContext) {
  const pack = getCountry(ctx.country);
  return new Intl.DateTimeFormat(pack.locale, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: pack.timeZone,
  }).format(typeof date === "string" ? new Date(date) : date);
}

/** Currency symbol alone, for input adornments. */
export function currencySymbol(ctx: FormatContext) {
  const pack = getCountry(ctx.country);
  const currency = ctx.currency ?? pack.currency;
  const parts = new Intl.NumberFormat(pack.locale, { style: "currency", currency }).formatToParts(0);
  return parts.find((p) => p.type === "currency")?.value ?? currency;
}
