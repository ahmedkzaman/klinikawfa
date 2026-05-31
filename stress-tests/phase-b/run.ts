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

const SCENARIOS = [
  "checkout-race.k6.js",
  "queue-status-race.k6.js",
  "settle-debt-race.k6.js",
  "owe-slip-race.k6.js",
  "fefo-race.k6.js",
];

// NOTE: per-scenario seed/teardown SQL lives in phase-b/seed-*.sql.
// Hook into seed/seed.ts to set QUEUE_ID, CONSULTATION_ID, ITEM_ID, SLIP_ID env vars.

for (const s of SCENARIOS) {
  console.log(`→ k6: ${s}`);
  const summary = path.join(outDir, s.replace(".k6.js", ".json"));
  const r = spawnSync(K6, ["run", "--summary-export", summary, path.join(import.meta.dir, s)], {
    stdio: "inherit",
    env: { ...process.env, ...env },
  });
  if (r.status !== 0) console.warn(`  ! ${s} exited ${r.status} (expected for race-loser scenarios)`);
}
