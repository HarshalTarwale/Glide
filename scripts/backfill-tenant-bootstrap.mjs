/**
 * Backfills essential master data into tenants created before
 * src/server/core/bootstrap-tenant.ts existed.
 *
 * Those tenants have roles and a company but no units of measure, tax
 * categories, tax rates, price list, warehouse or locations — which means
 * they cannot create a single product, since Product.uomId is a non-null FK.
 *
 * Idempotent: a tenant that already has units of measure is skipped, so this
 * is safe to run repeatedly and safe to run after every deploy.
 *
 * Usage:
 *   node scripts/backfill-tenant-bootstrap.mjs          # report only
 *   node scripts/backfill-tenant-bootstrap.mjs --apply  # actually write
 */
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import { config as loadEnv } from "dotenv";

loadEnv();
neonConfig.webSocketConstructor = ws;

const APPLY = process.argv.includes("--apply");

// Uses the OWNER connection deliberately: this is an administrative repair
// across every tenant, which by design no single tenant session can perform.
const url = process.env.MIGRATE_DATABASE_URL ?? process.env.DATABASE_URL;
if (!url || url.includes("placeholder")) {
  console.error("Set MIGRATE_DATABASE_URL (or DATABASE_URL) first.");
  process.exit(1);
}

const pool = new Pool({ connectionString: url });

const UNITS = [
  ["unit", "Units", "unit", 1, true, 0],
  ["pcs", "Pieces", "unit", 1, false, 0],
  ["box", "Box of 12", "unit", 12, false, 0],
  ["kg", "Kilograms", "weight", 1, true, 3],
  ["g", "Grams", "weight", 0.001, false, 0],
  ["l", "Litres", "volume", 1, true, 3],
  ["m", "Metres", "length", 1, true, 2],
  ["hr", "Hours", "time", 1, true, 2],
];

const TAX_CATEGORIES = [
  ["standard", "Standard rate"],
  ["reduced", "Reduced rate"],
  ["zero", "Zero-rated"],
  ["exempt", "Exempt"],
];

const DEFAULT_RATES = {
  IN: [["GST 18%", 18, "standard"], ["GST 5%", 5, "reduced"], ["GST 0%", 0, "zero"]],
  GB: [["VAT 20%", 20, "standard"], ["VAT 5%", 5, "reduced"], ["VAT 0%", 0, "zero"]],
  AE: [["VAT 5%", 5, "standard"], ["VAT 0%", 0, "zero"]],
  DE: [["VAT 19%", 19, "standard"], ["VAT 7%", 7, "reduced"], ["VAT 0%", 0, "zero"]],
  US: [],
};

const { rows: tenants } = await pool.query(`
  select t.id, t.name, t.country, t.currency,
         (select count(*) from unit_of_measure u where u."tenantId" = t.id) as uoms,
         (select id from company c where c."tenantId" = t.id order by c."createdAt" limit 1) as company_id
  from tenant t
  order by t."createdAt"
`);

const needing = tenants.filter((t) => Number(t.uoms) === 0);

console.log(`${tenants.length} tenant(s) total; ${needing.length} missing master data.`);
for (const t of needing) console.log(`  - ${t.name} (${t.country})`);

if (needing.length === 0) {
  await pool.end();
  process.exit(0);
}

if (!APPLY) {
  console.log("\nDry run. Re-run with --apply to write.");
  await pool.end();
  process.exit(0);
}

for (const t of needing) {
  if (!t.company_id) {
    console.warn(`  SKIP ${t.name}: no company row, cannot create a warehouse.`);
    continue;
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // Scope the transaction so every insert satisfies its own RLS WITH CHECK,
    // exactly as the application would. The owner role could bypass this, but
    // writing through the same predicate the app uses is what proves the data
    // is correctly attributed.
    await client.query("select set_config('app.current_tenant_id', $1, true)", [t.id]);

    for (const [code, name, category, factor, isReference, precision] of UNITS) {
      await client.query(
        `insert into unit_of_measure ("id","tenantId","code","name","category","factor","isReference","precision","createdAt","updatedAt")
         values (gen_random_uuid(),$1,$2,$3,$4,$5,$6,$7,now(),now())`,
        [t.id, code, name, category, factor, isReference, precision]
      );
    }

    const categoryIds = {};
    for (const [key, name] of TAX_CATEGORIES) {
      const r = await client.query(
        `insert into tax_category ("id","tenantId","key","name","createdAt","updatedAt")
         values (gen_random_uuid(),$1,$2,$3,now(),now()) returning id`,
        [t.id, key, name]
      );
      categoryIds[key] = r.rows[0].id;
    }

    for (const [name, rate, category] of DEFAULT_RATES[t.country] ?? []) {
      await client.query(
        `insert into tax_rate ("id","tenantId","name","country","rate","level","taxCategoryId","isActive","createdAt","updatedAt")
         values (gen_random_uuid(),$1,$2,$3,$4,'national',$5,true,now(),now())`,
        [t.id, name, t.country, rate, categoryIds[category] ?? null]
      );
    }

    await client.query(
      `insert into price_list ("id","tenantId","name","currency","isDefault","isActive","createdAt","updatedAt")
       values (gen_random_uuid(),$1,'Default',$2,true,true,now(),now())`,
      [t.id, t.currency]
    );

    const wh = await client.query(
      `insert into warehouse ("id","tenantId","companyId","code","name","country","isActive","createdAt","updatedAt")
       values (gen_random_uuid(),$1,$2,'MAIN','Main Warehouse',$3,true,now(),now()) returning id`,
      [t.id, t.company_id, t.country]
    );

    const locations = [
      [wh.rows[0].id, "internal", "MAIN/STOCK", "Stock"],
      [null, "external", "SUPPLIERS", "Suppliers"],
      [null, "external", "CUSTOMERS", "Customers"],
      [null, "adjustment", "ADJUST", "Inventory Adjustment"],
    ];
    for (const [warehouseId, kind, code, name] of locations) {
      await client.query(
        `insert into location ("id","tenantId","warehouseId","kind","code","name","isActive","createdAt","updatedAt")
         values (gen_random_uuid(),$1,$2,$3::"LocationKind",$4,$5,true,now(),now())`,
        [t.id, warehouseId, kind, code, name]
      );
    }

    await client.query("COMMIT");
    console.log(`  OK ${t.name}: units, tax categories/rates, price list, warehouse, 4 locations`);
  } catch (error) {
    await client.query("ROLLBACK");
    console.error(`  FAILED ${t.name}:`, error.message);
  } finally {
    client.release();
  }
}

await pool.end();
console.log("\nBackfill complete.");
