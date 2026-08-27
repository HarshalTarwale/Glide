/**
 * Seeds tenant-agnostic reference data: countries and currencies.
 *
 * These tables carry no tenant_id and no RLS policy — every tenant reads the
 * same rows — so this runs without any tenant context.
 *
 * Run with:  npm run db:seed
 */
import { PrismaNeon } from "@prisma/adapter-neon";
import { neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import { PrismaClient } from "../src/generated/prisma/client.js";
import { COUNTRY_LIST } from "../src/lib/i18n/countries.js";

neonConfig.webSocketConstructor = ws;

const CURRENCIES = [
  { code: "INR", name: "Indian Rupee", symbol: "₹", decimals: 2 },
  { code: "USD", name: "US Dollar", symbol: "$", decimals: 2 },
  { code: "GBP", name: "Pound Sterling", symbol: "£", decimals: 2 },
  { code: "AED", name: "UAE Dirham", symbol: "د.إ", decimals: 2 },
  { code: "EUR", name: "Euro", symbol: "€", decimals: 2 },
  // Included deliberately as the standing proof that money cannot be stored
  // as "minor units x 100" — see docs/architecture.md §3.2.
  { code: "JPY", name: "Japanese Yen", symbol: "¥", decimals: 0 },
  { code: "JOD", name: "Jordanian Dinar", symbol: "د.ا", decimals: 3 },
];

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString || connectionString.includes("placeholder")) {
    console.error("DATABASE_URL is not set to a real database. Nothing seeded.");
    process.exit(1);
  }

  const prisma = new PrismaClient({ adapter: new PrismaNeon({ connectionString }) });

  for (const c of CURRENCIES) {
    await prisma.currency.upsert({ where: { code: c.code }, update: c, create: c });
  }
  console.log(`Seeded ${CURRENCIES.length} currencies.`);

  for (const c of COUNTRY_LIST) {
    const row = {
      code: c.code,
      name: c.name,
      locale: c.locale,
      currency: c.currency,
      taxRegime: c.taxRegime,
      taxLabel: c.taxLabel,
      taxIdLabel: c.taxIdLabel,
      regionLabel: c.regionLabel,
      pricesIncludeTax: c.pricesIncludeTax,
      timeZone: c.timeZone,
    };
    await prisma.country.upsert({ where: { code: c.code }, update: row, create: row });
  }
  console.log(`Seeded ${COUNTRY_LIST.length} countries.`);

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
