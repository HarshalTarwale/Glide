/**
 * Backfills the "PRODUCTION" virtual location into tenants created before
 * this location existed in bootstrap-tenant.ts.
 *
 * Those tenants have no location of kind='production', which means
 * completeWorkOrder() cannot find its consumption/production counterparty
 * and throws (Prisma's findFirstOrThrow) the moment anyone tries to
 * complete a work order for them -- caught by the acting user as a plain
 * error, never silently wrong, but still worth fixing proactively rather
 * than waiting for someone to hit it.
 *
 * Idempotent: skips any tenant that already has one.
 *
 * Usage:
 *   node scripts/backfill-manufacturing.mjs          # report only
 *   node scripts/backfill-manufacturing.mjs --apply  # actually write
 */
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import { config as loadEnv } from "dotenv";

loadEnv();
neonConfig.webSocketConstructor = ws;

const APPLY = process.argv.includes("--apply");

const url = process.env.MIGRATE_DATABASE_URL ?? process.env.DATABASE_URL;
if (!url || url.includes("placeholder")) {
  console.error("Set MIGRATE_DATABASE_URL (or DATABASE_URL) first.");
  process.exit(1);
}

const pool = new Pool({ connectionString: url });

const { rows: tenants } = await pool.query(`
  select t.id as tenant_id, t.name as tenant_name,
         exists(select 1 from location l where l."tenantId" = t.id and l.kind = 'production') as has_location
  from tenant t
  order by t."createdAt"
`);

const needing = tenants.filter((t) => !t.has_location);

console.log(`${tenants.length} tenant(s) total; ${needing.length} missing the PRODUCTION location.`);
for (const t of needing) console.log(`  - ${t.tenant_name}`);

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
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("select set_config('app.current_tenant_id', $1, true)", [t.tenant_id]);
    await client.query(
      `insert into location ("id","tenantId","kind","code","name","isActive","createdAt","updatedAt")
       values (gen_random_uuid(),$1,'production'::"LocationKind",'PRODUCTION','Production',true,now(),now())`,
      [t.tenant_id]
    );
    await client.query("COMMIT");
    console.log(`  OK ${t.tenant_name}`);
  } catch (error) {
    await client.query("ROLLBACK");
    console.error(`  FAILED ${t.tenant_name}:`, error.message);
  } finally {
    client.release();
  }
}

await pool.end();
console.log("\nBackfill complete.");
