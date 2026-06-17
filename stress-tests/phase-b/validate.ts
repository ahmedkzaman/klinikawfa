/**
 * Phase B post-run invariants. Fails the phase if any breaks.
 */
import postgres from "postgres";
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";

const sql = postgres(process.env.STAGING_DB_URL!, { max: 2 });
const outIdx = process.argv.indexOf("--out");
const outDir = outIdx >= 0 ? process.argv[outIdx+1] : "reports";
mkdirSync(outDir, { recursive: true });

const CHECKS: { name: string; sql: string; expectZero: boolean }[] = [
  {
    name: "no consultation overpaid",
    expectZero: true,
    sql: `
      SELECT c.id
      FROM public.consultations c
      WHERE COALESCE((SELECT SUM(amount) FROM public.payments WHERE consultation_id = c.id AND deleted_at IS NULL),0)
          > COALESCE((SELECT SUM(price*quantity) FROM public.consultation_items WHERE consultation_id = c.id AND deleted_at IS NULL),0)
    `,
  },
  {
    name: "no negative inventory stock",
    expectZero: true,
    sql: `SELECT id FROM public.inventory_items WHERE stock < 0 OR stock < allocated_quantity`,
  },
  {
    name: "no negative batch remaining",
    expectZero: true,
    sql: `SELECT id FROM public.inventory_item_batches WHERE quantity_remaining < 0`,
  },
  {
    name: "no duplicate queue_sequence per day",
    expectZero: true,
    sql: `
      SELECT created_at::date AS d, queue_sequence, COUNT(*)
      FROM public.queue_entries
      WHERE deleted_at IS NULL
      GROUP BY 1,2
      HAVING COUNT(*) > 1
    `,
  },
  {
    name: "no completed consultation with open queue",
    expectZero: true,
    sql: `
      SELECT c.id
      FROM public.consultations c
      JOIN public.queue_entries qe ON qe.id = c.queue_entry_id
      WHERE c.status = 'completed' AND qe.clinic_status <> 'completed'
    `,
  },
];

const results: any[] = [];
for (const c of CHECKS) {
  const rows = await sql.unsafe(c.sql);
  const pass = c.expectZero ? rows.length === 0 : rows.length > 0;
  results.push({ ...c, count: rows.length, pass });
  console.log(`${pass ? "✓" : "✗"} ${c.name} (${rows.length} rows)`);
}

const md = [
  "# Phase B — RPC Contention Invariants",
  "",
  "| Check | Rows | Pass |",
  "|---|---|---|",
  ...results.map(r => `| ${r.name} | ${r.count} | ${r.pass ? "✓" : "✗"} |`),
].join("\n");
writeFileSync(path.join(outDir, "phase-b-invariants.md"), md);

await sql.end();
if (results.some(r => !r.pass)) process.exit(1);
