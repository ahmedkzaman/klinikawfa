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

/**
 * Queue entries + consultations. 1M + ~800k rows.
 * Uses session_replication_role = replica to skip ALL triggers (including FK
 * trigger fires) for this connection — much cheaper than per-table DISABLE TRIGGER
 * and reversible by closing the connection.
 *
 * Inserts in 10k chunks with multi-row INSERT via postgres.js helpers.
 * Memory stays flat because we never accumulate >10k rows in JS at once.
 */
async function seedQueueAndConsultations(patientIds: string[]) {
  console.log(`→ Seeding ${VOLUMES.queue_entries.toLocaleString()} queue + ~${VOLUMES.consultations.toLocaleString()} consultations`);
  await sql`SET session_replication_role = replica`;

  const CHUNK = 10_000;
  let totalQ = 0, totalC = 0;

  for (let off = 0; off < VOLUMES.queue_entries; off += CHUNK) {
    const queueBatch: any[] = [];
    const consultBatch: any[] = [];

    for (let j = 0; j < CHUNK && off + j < VOLUMES.queue_entries; j++) {
      const patientId = faker.helpers.arrayElement(patientIds);
      const queueId = crypto.randomUUID();
      const visitType = faker.helpers.weightedArrayElement([
        { weight: 85, value: "consultation" },
        { weight: 10, value: "payment_only" },
        { weight: 5,  value: "direct_sale" },
      ]);
      const status = faker.helpers.weightedArrayElement([
        { weight: 80, value: "completed" },
        { weight: 10, value: "sent_to_dispensary" },
        { weight: 10, value: "registered" },
      ]);
      const createdAt = faker.date.past({ years: 2 });

      queueBatch.push({
        id: queueId,
        patient_id: patientId,
        visit_type: visitType,
        clinic_status: status,
        visit_purpose: faker.helpers.arrayElement(["fever", "cough", "follow-up", "other"]),
        queue_sequence: (off + j) % 1000 + 1,
        created_at: createdAt,
        updated_at: createdAt,
      });

      if (visitType === "consultation") {
        consultBatch.push({
          id: crypto.randomUUID(),
          patient_id: patientId,
          queue_entry_id: queueId,
          status: status === "completed" ? "completed" : "in_progress",
          clinical_notes: faker.lorem.sentence(),
          created_at: createdAt,
          updated_at: createdAt,
        });
      }
    }

    await sql`INSERT INTO public.queue_entries ${sql(queueBatch)} ON CONFLICT DO NOTHING`;
    if (consultBatch.length) {
      await sql`INSERT INTO public.consultations ${sql(consultBatch)} ON CONFLICT DO NOTHING`;
    }
    totalQ += queueBatch.length;
    totalC += consultBatch.length;
    if (off % 100_000 === 0) console.log(`  ${totalQ.toLocaleString()} queue / ${totalC.toLocaleString()} consult`);
  }

  await sql`SET session_replication_role = DEFAULT`;
}

/**
 * Consultation items (~500k). Each row references a random completed consultation.
 * Realistic price/qty mix; 60% inventory item names so reservation triggers
 * (when re-enabled in real ops) would have something to resolve.
 */
async function seedConsultationItems() {
  console.log(`→ Seeding ${VOLUMES.consultation_items.toLocaleString()} consultation items`);
  await sql`SET session_replication_role = replica`;
  const consultIds = (await sql<{id: string}[]>`SELECT id FROM public.consultations ORDER BY random() LIMIT ${VOLUMES.consultation_items}`).map(r => r.id);
  const invNames = (await sql<{name: string}[]>`SELECT name FROM public.inventory_items WHERE status='active' LIMIT 100`).map(r => r.name);
  const fallbackNames = ["Consultation Fee", "Wound Dressing", "Nebulizer", "ECG", "Blood Pressure Check"];

  const CHUNK = 10_000;
  for (let off = 0; off < consultIds.length; off += CHUNK) {
    const batch: any[] = [];
    for (let j = 0; j < CHUNK && off + j < consultIds.length; j++) {
      const useInv = invNames.length && Math.random() < 0.6;
      batch.push({
        consultation_id: consultIds[off + j],
        item_name: useInv ? faker.helpers.arrayElement(invNames) : faker.helpers.arrayElement(fallbackNames),
        quantity: faker.number.int({ min: 1, max: 10 }),
        price: faker.number.float({ min: 5, max: 250, fractionDigits: 2 }),
      });
    }
    await sql`INSERT INTO public.consultation_items ${sql(batch)}`;
    if (off % 100_000 === 0) console.log(`  ${(off + CHUNK).toLocaleString()} / ${consultIds.length.toLocaleString()}`);
  }
  await sql`SET session_replication_role = DEFAULT`;
}

/**
 * Payments (~100k). Mostly self_pay/cash against completed consultations.
 */
async function seedPayments() {
  console.log(`→ Seeding ${VOLUMES.payments.toLocaleString()} payments`);
  await sql`SET session_replication_role = replica`;
  const rows = await sql<{id: string; queue_entry_id: string}[]>`
    SELECT id, queue_entry_id FROM public.consultations
    WHERE status='completed' AND queue_entry_id IS NOT NULL
    ORDER BY random() LIMIT ${VOLUMES.payments}
  `;
  const CHUNK = 10_000;
  for (let off = 0; off < rows.length; off += CHUNK) {
    const batch = rows.slice(off, off + CHUNK).map(r => ({
      queue_entry_id: r.queue_entry_id,
      consultation_id: r.id,
      payment_type: "self_pay",
      payment_method: faker.helpers.arrayElement(["cash", "card", "duitnow"]),
      amount: faker.number.float({ min: 10, max: 500, fractionDigits: 2 }),
    }));
    await sql`INSERT INTO public.payments ${sql(batch)}`;
  }
  await sql`SET session_replication_role = DEFAULT`;
}

/**
 * Inventory batches + transactions. 50k tx, batches derived ~1:1.
 */
async function seedInventoryBatchesAndTx() {
  console.log(`→ Seeding ${VOLUMES.inventory_transactions.toLocaleString()} inventory tx + batches`);
  await sql`SET session_replication_role = replica`;
  const items = (await sql<{id: string}[]>`SELECT id FROM public.inventory_items LIMIT 500`).map(r => r.id);
  if (!items.length) { console.warn("  no inventory_items; skipping"); await sql`SET session_replication_role = DEFAULT`; return; }

  const CHUNK = 5_000;
  for (let off = 0; off < VOLUMES.inventory_transactions; off += CHUNK) {
    const batches: any[] = [];
    const txs: any[] = [];
    for (let j = 0; j < CHUNK && off + j < VOLUMES.inventory_transactions; j++) {
      const itemId = faker.helpers.arrayElement(items);
      const qty = faker.number.int({ min: 10, max: 500 });
      const batchId = crypto.randomUUID();
      const expiry = faker.date.future({ years: 3 }).toISOString().slice(0, 10);
      batches.push({
        id: batchId, inventory_item_id: itemId,
        batch_number: faker.string.alphanumeric(8).toUpperCase(),
        expiry_date: expiry,
        quantity_initial: qty, quantity_remaining: qty,
      });
      txs.push({
        inventory_item_id: itemId, batch_id: batchId,
        transaction_type: "restock", qty_change: qty, reason_code: "seed",
      });
    }
    await sql`INSERT INTO public.inventory_item_batches ${sql(batches)}`;
    await sql`INSERT INTO public.inventory_transactions ${sql(txs)}`;
  }
  await sql`SET session_replication_role = DEFAULT`;
}

async function main() {
  await disableTriggersAndIndexes();
  try {
    await truncate();
    await seedPatients();
    const patientIds = (await sql<{id: string}[]>`SELECT id FROM public.patients`).map(r => r.id);
    await seedQueueAndConsultations(patientIds);
    await seedConsultationItems();
    await seedPayments();
    await seedInventoryBatchesAndTx();
  } finally {
    await rebuildIndexesAndAnalyze();
  }
  console.log("✓ Seed complete");
  await sql.end();
}

main().catch((e) => { console.error(e); process.exit(1); });

