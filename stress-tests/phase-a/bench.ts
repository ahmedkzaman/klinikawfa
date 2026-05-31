/**
 * Phase A benchmark: EXPLAIN (ANALYZE, BUFFERS) + 200-iter latency loop per query.
 * Flags any Seq Scan on hot tables as a failure.
 */
import postgres from "postgres";
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import path from "node:path";

const DB_URL = process.env.STAGING_DB_URL!;
const sql = postgres(DB_URL, { max: 2 });

const TARGETS: Record<string, number> = {
  "patient-search": 200,
  "queue-today": 300,
  "checkout-prep": 300,
  "fefo-batch": 50,
  "visit-history": 250,
  "panel-claims": 400,
};

const HOT_TABLES = ["patients","queue_entries","consultations","consultation_items","payments","inventory_item_batches"];

function pct(arr: number[], p: number) {
  const a = [...arr].sort((x,y) => x-y);
  return a[Math.floor((p/100) * (a.length - 1))];
}

async function sampleParams() {
  const p = await sql`SELECT id, national_id FROM public.patients ORDER BY random() LIMIT 1`;
  const c = await sql`SELECT id FROM public.consultations ORDER BY random() LIMIT 1`;
  const i = await sql`SELECT id FROM public.inventory_items ORDER BY random() LIMIT 1`;
  return {
    q: `%${(p[0]?.national_id ?? "").slice(0,4)}%`,
    patient_id: p[0]?.id,
    consultation_id: c[0]?.id,
    item_id: i[0]?.id,
  };
}

async function runOne(name: string, sqlText: string, params: Record<string, any>) {
  const bind = (s: string) => s.replace(/:(\w+)/g, (_, k) => {
    const v = params[k];
    return typeof v === "string" ? `'${v.replace(/'/g, "''")}'` : String(v);
  });
  const bound = bind(sqlText);

  const plan = await sql.unsafe(`EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT) ${bound}`);
  const planText = plan.map((r: any) => r["QUERY PLAN"]).join("\n");
  const seqScanOnHot = HOT_TABLES.some(t => new RegExp(`Seq Scan on (public\\.)?${t}\\b`).test(planText));

  const timings: number[] = [];
  for (let i = 0; i < 200; i++) {
    const t = performance.now();
    await sql.unsafe(bound);
    timings.push(performance.now() - t);
  }

  return {
    name,
    p50: pct(timings, 50),
    p95: pct(timings, 95),
    p99: pct(timings, 99),
    target: TARGETS[name],
    seqScanOnHot,
    plan: planText,
  };
}

async function main() {
  const outIdx = process.argv.indexOf("--out");
  const outDir = outIdx >= 0 ? process.argv[outIdx+1] : "reports";
  const params = await sampleParams();
  const dir = path.join(import.meta.dir, "queries");
  const results: any[] = [];

  for (const f of readdirSync(dir).filter(f => f.endsWith(".sql"))) {
    const name = f.replace(".sql","");
    const text = readFileSync(path.join(dir, f), "utf8");
    console.log(`→ ${name}`);
    results.push(await runOne(name, text, params));
  }

  const md = [
    "# Phase A — DB Scale Bench",
    "",
    "| Query | p50 ms | p95 ms | p99 ms | Target p95 | Seq Scan on hot table? | Pass |",
    "|---|---|---|---|---|---|---|",
    ...results.map(r => `| ${r.name} | ${r.p50.toFixed(1)} | ${r.p95.toFixed(1)} | ${r.p99.toFixed(1)} | ${r.target} | ${r.seqScanOnHot ? "**YES**" : "no"} | ${(!r.seqScanOnHot && r.p95 <= r.target) ? "✓" : "✗"} |`),
    "",
    "## Plans",
    ...results.flatMap(r => [`### ${r.name}`, "```", r.plan, "```", ""]),
  ].join("\n");

  writeFileSync(path.join(outDir, "phase-a.md"), md);
  console.log(`✓ Wrote ${outDir}/phase-a.md`);

  const failed = results.filter(r => r.seqScanOnHot || r.p95 > r.target);
  if (failed.length) {
    console.error(`✗ ${failed.length} queries failed budgets — see report`);
    process.exit(1);
  }
  await sql.end();
}

main();
