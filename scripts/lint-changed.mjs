#!/usr/bin/env node
import { spawnSync } from 'node:child_process';

const lintableExtensions = /\.(?:c|m)?(?:j|t)sx?$/;
const baseRef = process.env.GITHUB_BASE_REF || process.env.LINT_BASE_REF || 'main';

function run(command, args, options = {}) {
  return spawnSync(command, args, {
    stdio: options.stdio ?? 'pipe',
    encoding: 'utf8',
    shell: process.platform === 'win32',
    ...options,
  });
}

// In GitHub Actions pull_request checkouts, the base branch may not exist
// locally. Fetch it so the diff is PR-scoped rather than repo-wide.
run('git', ['fetch', '--no-tags', '--depth=1', 'origin', baseRef], { stdio: 'inherit' });

const diff = run('git', [
  'diff',
  '--name-only',
  '--diff-filter=ACMR',
  `origin/${baseRef}...HEAD`,
]);

if (diff.status !== 0) {
  process.stderr.write(diff.stderr || diff.stdout || 'Unable to determine changed files.\n');
  process.exit(diff.status ?? 1);
}

const files = diff.stdout
  .split(/\r?\n/)
  .map((file) => file.trim())
  .filter((file) => lintableExtensions.test(file));

if (files.length === 0) {
  console.log(`No changed lintable JS/TS files compared with origin/${baseRef}.`);
  process.exit(0);
}

console.log(`Linting ${files.length} changed JS/TS file(s) compared with origin/${baseRef}:`);
for (const file of files) console.log(`- ${file}`);

const eslint = run('npx', ['eslint', ...files], { stdio: 'inherit' });
process.exit(eslint.status ?? 1);
