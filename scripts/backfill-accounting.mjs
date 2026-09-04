/**
 * Backfills the default chart of accounts into tenants created before
 * src/server/accounting/accounting-bootstrap.ts existed.
 *
 * Those tenants have no LedgerAccount rows at all, which means
 * gl-subscriber.ts cannot post a journal entry for any invoice, payment or
 * credit note they create — getSystemAccounts() throws (caught and logged,
 * never blocking the document itself), so the ledger just silently never
 * has anything in it for that tenant until this runs.
 *
 * Idempotent: mirrors bootstrapAccounting()'s own per-systemKey skip, so
 * this is safe to run repeatedly and safe to run after every deploy.
 *
 * Usage:
 *   node scripts/backfill-accounting.mjs          # report only
 *   node scripts/backfill-accounting.mjs --apply  # actually write
 */
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import { config as loadEnv } from "dotenv";

loadEnv();
neonConfig.webSocketConstructor = ws;

const APPLY = process.argv.includes("--apply");

// Owner connection deliberately: an administrative repair across every
// tenant, which by design no single tenant session can perform.
const url = process.env.MIGRATE_DATABASE_URL ?? process.env.DATABASE_URL;
if (!url || url.includes("placeholder")) {
  console.error("Set MIGRATE_DATABASE_URL (or DATABASE_URL) first.");
  process.exit(1);
}

const pool = new Pool({ connectionString: url });

const DEFAULT_ACCOUNTS = [
  ["1000", "Cash and Bank", "asset", "cash"],
  ["1100", "Accounts Receivable", "asset", "accounts_receivable"],
  ["1200", "Inventory", "asset", "inventory_asset"],
  ["2000", "Accounts Payable", "liability", "accounts_payable"],
  ["2100", "Tax Payable", "liability", "tax_payable"],
  ["3000", "Retained Earnings", "equity", "retained_earnings"],
  ["4000", "Sales Revenue", "revenue", "sales_revenue"],
  ["5000", "Cost of Goods Sold", "expense", "cost_of_goods_sold"],
];

const { rows: companies } = await pool.query(`
  select c.id as company_id, c."tenantId" as tenant_id, t.name as tenant_name,
         (select count(*) from ledger_account a where a."companyId" = c.id and a."systemKey" is not null) as existing
  from company c
  join tenant t on t.id = c."tenantId"
  order by t."createdAt"
`);

const needing = companies.filter((c) => Number(c.existing) < DEFAULT_ACCOUNTS.length);

console.log(`${companies.length} compan(y/ies) total; ${needing.length} missing one or more default accounts.`);
for (const c of needing) console.log(`  - ${c.tenant_name}: ${c.existing}/${DEFAULT_ACCOUNTS.length} present`);

if (needing.length === 0) {
  await pool.end();
  process.exit(0);
}

if (!APPLY) {
  console.log("\nDry run. Re-run with --apply to write.");
  await pool.end();
  process.exit(0);
}

for (const c of needing) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // Scoped so every insert satisfies its own RLS WITH CHECK, the same
    // predicate the app itself would write under.
    await client.query("select set_config('app.current_tenant_id', $1, true)", [c.tenant_id]);

    const { rows: existingRows } = await client.query(
      `select "systemKey" from ledger_account where "companyId" = $1 and "systemKey" is not null`,
      [c.company_id]
    );
    const existingKeys = new Set(existingRows.map((r) => r.systemKey));

    let created = 0;
    for (const [code, name, type, systemKey] of DEFAULT_ACCOUNTS) {
      if (existingKeys.has(systemKey)) continue;
      await client.query(
        `insert into ledger_account ("id","tenantId","companyId","code","name","type","systemKey","isActive","createdAt","updatedAt")
         values (gen_random_uuid(),$1,$2,$3,$4,$5::"AccountType",$6,true,now(),now())`,
        [c.tenant_id, c.company_id, code, name, type, systemKey]
      );
      created++;
    }

    await client.query("COMMIT");
    console.log(`  OK ${c.tenant_name}: ${created} account(s) created`);
  } catch (error) {
    await client.query("ROLLBACK");
    console.error(`  FAILED ${c.tenant_name}:`, error.message);
  } finally {
    client.release();
  }
}

await pool.end();
console.log("\nBackfill complete.");
