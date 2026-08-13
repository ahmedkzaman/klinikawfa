/** Runs Phase B against isolated targets and fails on any setup, k6, or teardown error. */
import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { runPhaseBCommands } from './runnerContract';
import { loadStagingEnv } from '../loadStagingEnv';

loadStagingEnv(path.join(import.meta.dir, '..', '.env.staging'));

const outIdx = process.argv.indexOf('--out');
const outDir = path.join(outIdx >= 0 ? process.argv[outIdx + 1] : 'reports', 'phase-b');
mkdirSync(outDir, { recursive: true });

const env = {
  API_URL: process.env.STAGING_API_URL!,
  ANON_KEY: process.env.STAGING_ANON_KEY!,
  AUTH_TOKEN: process.env.STAGING_AUTH_TOKEN!,
};
const K6 = process.env.K6_BIN ?? 'k6';
const SCENARIOS: { script: string; envExtra: Record<string, string> }[] = [
  { script: 'checkout-race.k6.js', envExtra: { QUEUE_ID: 'a0000000-0000-4000-8000-000000000001', CONSULTATION_ID: 'c1000000-0000-4000-8000-000000000001' } },
  { script: 'queue-status-race.k6.js', envExtra: { QUEUE_ID: 'a0000000-0000-4000-8000-000000000003' } },
  { script: 'settle-debt-race.k6.js', envExtra: { QUEUE_ID: 'a0000000-0000-4000-8000-000000000002', CONSULTATION_IDS: '["c1000000-0000-4000-8000-000000000002","c1000000-0000-4000-8000-000000000004"]', AMOUNT: '150', IDEMPOTENCY_KEY: 'd0000000-0000-4000-8000-000000000002' } },
  { script: 'owe-slip-race.k6.js', envExtra: { SLIP_ID: '05100000-0000-0000-0000-000000000001' } },
  { script: 'fefo-race.k6.js', envExtra: { ITEM_ID: '11110000-0000-0000-0000-000000000001' } },
];

runPhaseBCommands({
  spawn: spawnSync,
  preflight: {
    label: 'Phase B authenticated staff JWT preflight',
    command: process.execPath,
    args: [path.join(import.meta.dir, 'auth-preflight.ts')],
    options: { stdio: 'inherit', env: process.env },
  },
  setup: {
    label: 'Phase B setup', command: 'psql',
    args: [process.env.STAGING_DB_URL!, '-v', 'ON_ERROR_STOP=1', '-f', path.join(import.meta.dir, 'setup-targets.sql')],
    options: { stdio: 'inherit' },
  },
  scenarios: SCENARIOS.map(({ script, envExtra }) => ({
    label: script,
    command: K6,
    args: ['run', '--summary-export', path.join(outDir, script.replace('.k6.js', '.json')), path.join(import.meta.dir, script)],
    options: { stdio: 'inherit', env: { ...process.env, ...env, ...envExtra } },
  })),
  validate: {
    label: 'Phase B post-race invariants',
    command: process.execPath,
    args: [path.join(import.meta.dir, 'validate.ts'), '--out', outDir],
    options: { stdio: 'inherit', env: process.env },
  },
  teardown: {
    label: 'Phase B teardown', command: 'psql',
    args: [process.env.STAGING_DB_URL!, '-v', 'ON_ERROR_STOP=1', '-f', path.join(import.meta.dir, 'teardown-targets.sql')],
    options: { stdio: 'inherit' },
  },
});
