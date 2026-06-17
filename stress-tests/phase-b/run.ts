/**
 * Orchestrates Phase B k6 scenarios sequentially. Each scenario:
 *   1. Seeds one target row (idempotent)
 *   2. Runs the k6 script (50 VUs × 50 iters)
 *   3. Captures k6 summary into reports/{runId}/phase-b/{scenario}.json
 *
 * k6 binary is not an npm dep — invoke via `nix run nixpkgs#k6` or system k6.
 */
import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import path from "node:path";

const outIdx = process.argv.indexOf("--out");
const outDir = path.join(outIdx >= 0 ? process.argv[outIdx+1] : "reports", "phase-b");
mkdirSync(outDir, { recursive: true });

const env = {
  API_URL: process.env.STAGING_API_URL!,
  SERVICE_KEY: process.env.STAGING_SERVICE_ROLE_KEY!,
};

const K6 = process.env.K6_BIN ?? "k6";

const SCENARIOS: { script: string; envExtra: Record<string,string> }[] = [
  { script: "checkout-race.k6.js",     envExtra: { QUEUE_ID: "q0000000-0000-0000-0000-000000000001", CONSULTATION_ID: "x0000000-0000-0000-0000-000000000001" } },
  { script: "queue-status-race.k6.js", envExtra: { QUEUE_ID: "q0000000-0000-0000-0000-000000000003" } },
  { script: "settle-debt-race.k6.js",  envExtra: { QUEUE_ID: "q0000000-0000-0000-0000-000000000002", CONSULTATION_IDS: '["x0000000-0000-0000-0000-000000000002"]', AMOUNT: "150" } },
  { script: "owe-slip-race.k6.js",     envExtra: { SLIP_ID: "05100000-0000-0000-0000-000000000001" } },
  { script: "fefo-race.k6.js",         envExtra: { ITEM_ID: "11110000-0000-0000-0000-000000000001" } },
];

// Seed isolated targets via psql before running k6
console.log("→ Seeding Phase B targets");
spawnSync("psql", [process.env.STAGING_DB_URL!, "-f", path.join(import.meta.dir, "setup-targets.sql")], { stdio: "inherit" });

for (const { script, envExtra } of SCENARIOS) {
  console.log(`→ k6: ${script}`);
  const summary = path.join(outDir, script.replace(".k6.js", ".json"));
  const r = spawnSync(K6, ["run", "--summary-export", summary, path.join(import.meta.dir, script)], {
    stdio: "inherit",
    env: { ...process.env, ...env, ...envExtra },
  });
  if (r.status !== 0) console.warn(`  ! ${script} exited ${r.status} (race-loser exits are expected)`);
}

console.log("→ Tearing down Phase B targets");
spawnSync("psql", [process.env.STAGING_DB_URL!, "-f", path.join(import.meta.dir, "teardown-targets.sql")], { stdio: "inherit" });

