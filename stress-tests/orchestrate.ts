/**
 * Runs phases A → B → C → D strictly sequentially, with observability side-car.
 * Sequential by design — concurrent k6 + Playwright on the same machine
 * adds artificial latency that invalidates Phase A/B numbers.
 */
import { spawn, spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import path from "node:path";

const ROOT = path.dirname(new URL(import.meta.url).pathname);
const args = process.argv.slice(2);
const phaseArg = args[args.indexOf("--phase") + 1];
const phases = phaseArg ? [phaseArg] : ["a", "b", "c", "d"];

const runId = new Date().toISOString().replace(/[:.]/g, "-");
const reportDir = path.join(ROOT, "reports", runId);
mkdirSync(reportDir, { recursive: true });

function sh(cmd: string, cwd = ROOT) {
  console.log(`\n→ ${cmd}`);
  const r = spawnSync("bash", ["-lc", cmd], { cwd, stdio: "inherit" });
  if (r.status !== 0) throw new Error(`exit ${r.status}: ${cmd}`);
}

// Guard first — refuses to proceed against prod.
sh("./scripts/guard-not-prod.sh");

// Observability side-car for the full run.
const observer = spawn("bun", ["run", "observe/watch.ts", "--out", reportDir], {
  cwd: ROOT,
  stdio: "inherit",
  env: { ...process.env, RUN_ID: runId },
});

try {
  sh(`./scripts/snapshot.sh pre-${runId}`);

  if (phases.includes("a")) {
    sh("bun run seed/seed.ts");
    sh(`bun run phase-a/bench.ts --out ${reportDir}`);
  }
  if (phases.includes("b")) {
    sh(`bun run phase-b/run.ts --out ${reportDir}`);
    sh(`bun run phase-b/validate.ts --out ${reportDir}`);
  }
  if (phases.includes("c")) {
    sh(`bunx playwright test --config=phase-c/playwright.config.ts --reporter=json > ${reportDir}/phase-c.json`);
  }
  if (phases.includes("d")) {
    sh(`bun test phase-d/rls.test.ts`);
  }

  sh(`./scripts/snapshot.sh post-${runId}`);
  console.log(`\n✓ Run complete: reports/${runId}/`);
} finally {
  observer.kill("SIGTERM");
}
