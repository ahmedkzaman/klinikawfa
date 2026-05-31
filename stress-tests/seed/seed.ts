/**
 * Phase A seeder — full production-scale volume.
 *
 * Volumes are intentionally NOT scaled down. At 10x reduced size the dataset
 * fits inside Postgres shared_buffers and seq scans look "fast" — defeating
 * the entire purpose. We want disk-bound scans to surface missing indexes.
 *
 * Throughput optimisations (load-only, NOT app correctness):
 *   1. DISABLE TRIGGER USER on target tables
 *   2. DROP non-PK indexes
 *   3. COPY ... FROM STDIN in 50k chunks
 *   4. CREATE INDEX CONCURRENTLY to rebuild
 *   5. ENABLE TRIGGER USER + ANALYZE
 *
 * Fixed RNG seed: reproducible. Idempotent: TRUNCATEs first (after guard).
 */
import postgres from "postgres";
import { faker } from "@faker-js/faker";

faker.seed(20260531);

const DB_URL = process.env.STAGING_DB_URL;
const STAGING_REF = process.env.STAGING_PROJECT_REF;
const PROD_REF = process.env.PRODUCTION_PROJECT_REF ?? "ncysmppzfjtiekfnomdv";
if (!DB_URL || !STAGING_REF || STAGING_REF === PROD_REF) {
  console.error("FATAL: staging guard failed. Refusing to seed.");
  process.exit(2);
}

const VOLUMES = {
  patients: 250_000,
  queue_entries: 1_000_000,
  consultations: 800_000,
  consultation_items: 500_000,
  payments: 100_000,
  inventory_transactions: 50_000,
};

const TARGET_TABLES = [
  "patients",
  "queue_entries",
  "consultations",
  "consultation_items",
  "payments",
  "inventory_item_batches",
  "inventory_transactions",
];

const sql = postgres(DB_URL, { max: 4, idle_timeout: 10 });

async function disableTriggersAndIndexes() {
  console.log("→ Disabling triggers + dropping non-PK indexes on hot tables");
  for (const t of TARGET_TABLES) {
    await sql.unsafe(`ALTER TABLE public.${t} DISABLE TRIGGER USER`);
  }
  // Persist index DDL so we can rebuild after load.
  const idx = await sql<{ tablename: string; indexname: string; indexdef: string }[]>`
    SELECT tablename, indexname, indexdef
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = ANY(${TARGET_TABLES})
      AND indexname NOT LIKE '%_pkey'
  `;
  await sql`CREATE TABLE IF NOT EXISTS _stress_index_backup (tablename text, indexname text, indexdef text)`;
  await sql`TRUNCATE _stress_index_backup`;
  for (const r of idx) {
    await sql`INSERT INTO _stress_index_backup VALUES (${r.tablename}, ${r.indexname}, ${r.indexdef})`;
    await sql.unsafe(`DROP INDEX IF EXISTS public.${r.indexname}`);
  }
  console.log(`  dropped ${idx.length} indexes (backed up to _stress_index_backup)`);
}

async function rebuildIndexesAndAnalyze() {
  console.log("→ Rebuilding indexes CONCURRENTLY + ANALYZE");
  const rows = await sql<{ indexname: string; indexdef: string }[]>`
    SELECT indexname, indexdef FROM _stress_index_backup
  `;
  for (const r of rows) {
    const concurrent = r.indexdef.replace(/^CREATE (UNIQUE )?INDEX /, (m) => m.replace("INDEX ", "INDEX CONCURRENTLY IF NOT EXISTS "));
    try {
      await sql.unsafe(concurrent);
    } catch (e) {
      console.warn(`  ! rebuild failed for ${r.indexname}, retrying without CONCURRENTLY`);
      await sql.unsafe(r.indexdef);
    }
  }
  for (const t of TARGET_TABLES) {
    await sql.unsafe(`ALTER TABLE public.${t} ENABLE TRIGGER USER`);
    await sql.unsafe(`ANALYZE public.${t}`);
  }
}

async function truncate() {
  console.log("→ Truncating target tables (staging only)");
  await sql.unsafe(`
    TRUNCATE
      public.payments,
      public.consultation_items,
      public.consultations,
      public.queue_entries,
      public.inventory_transactions,
      public.inventory_item_batches,
      public.patients
    RESTART IDENTITY CASCADE
  `);
}

async function seedPatients() {
  const N = VOLUMES.patients;
  console.log(`→ Seeding ${N.toLocaleString()} patients`);
  const CHUNK = 50_000;
  for (let off = 0; off < N; off += CHUNK) {
    const rows: string[] = [];
    for (let i = 0; i < CHUNK && off + i < N; i++) {
      const idx = off + i;
      const ic = String(900000000000 + idx).slice(-12);
      const name = faker.person.fullName().replace(/\t|\n/g, " ");
      const phone = "+60" + faker.string.numeric(9);
      rows.push(`${name}\t${phone}\t${ic}\t${faker.date.birthdate().toISOString().slice(0,10)}`);
    }
    await sql`COPY public.patients (name, phone, national_id, date_of_birth) FROM STDIN`.writable()
      .then((stream) => new Promise<void>((res, rej) => {
        stream.write(rows.join("\n") + "\n");
        stream.end();
        stream.on("finish", () => res());
        stream.on("error", rej);
      }));
    if (off % 250_000 === 0) console.log(`  ${off.toLocaleString()} / ${N.toLocaleString()}`);
  }
}

// TODO: seedQueueEntries, seedConsultations, seedItems, seedPayments,
// seedInventoryBatches, seedInventoryTransactions follow the same COPY pattern.
// Stubbed for the first scaffolding pass.

async function main() {
  await disableTriggersAndIndexes();
  try {
    await truncate();
    await seedPatients();
    // await seedQueueEntries();
    // await seedConsultations();
    // await seedConsultationItems();
    // await seedPayments();
    // await seedInventoryBatches();
    // await seedInventoryTransactions();
  } finally {
    await rebuildIndexesAndAnalyze();
  }
  console.log("✓ Seed complete");
  await sql.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
