/**
 * Side-car observability. Polls pg_stat_* + locks every 30s, writes CSV.
 * Edge-function/log polling is intentionally deferred — those live in the
 * Supabase dashboard tools (supabase--edge_function_logs, analytics_query)
 * and are pulled into the report by the orchestrator after the run.
 */
import postgres from "postgres";
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const sql = postgres(process.env.STAGING_DB_URL!, { max: 1 });
const outIdx = process.argv.indexOf("--out");
const outDir = outIdx >= 0 ? process.argv[outIdx+1] : "reports";
mkdirSync(outDir, { recursive: true });

const STATS_CSV = path.join(outDir, "observe-stats.csv");
const LOCKS_CSV = path.join(outDir, "observe-locks.csv");
writeFileSync(STATS_CSV, "ts,active,idle_in_tx,waiting,deadlocks,xact_rollback\n");
writeFileSync(LOCKS_CSV, "ts,wait_event_type,wait_event,count\n");

let stopped = false;
process.on("SIGTERM", () => { stopped = true; });
process.on("SIGINT",  () => { stopped = true; });

async function tick() {
  const ts = new Date().toISOString();
  const act = await sql<any[]>`
    SELECT
      COUNT(*) FILTER (WHERE state='active') AS active,
      COUNT(*) FILTER (WHERE state='idle in transaction') AS idle_in_tx,
      COUNT(*) FILTER (WHERE wait_event IS NOT NULL) AS waiting
    FROM pg_stat_activity WHERE datname = current_database()
  `;
  const db = await sql<any[]>`SELECT deadlocks, xact_rollback FROM pg_stat_database WHERE datname = current_database()`;
  appendFileSync(STATS_CSV, `${ts},${act[0].active},${act[0].idle_in_tx},${act[0].waiting},${db[0].deadlocks},${db[0].xact_rollback}\n`);

  const waits = await sql<any[]>`
    SELECT wait_event_type, wait_event, COUNT(*)::int AS n
    FROM pg_stat_activity
    WHERE wait_event IS NOT NULL AND datname = current_database()
    GROUP BY 1,2
  `;
  for (const w of waits) {
    appendFileSync(LOCKS_CSV, `${ts},${w.wait_event_type},${w.wait_event},${w.n}\n`);
  }
}

(async () => {
  while (!stopped) {
    try { await tick(); } catch (e) { console.error("observe tick error", e); }
    await new Promise(r => setTimeout(r, 30_000));
  }
  await sql.end();
})();
