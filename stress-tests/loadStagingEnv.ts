import { readFileSync } from 'node:fs';

/** Loads the guarded staging file into this process so every Bun/Node child
 * inherits the same endpoints and credentials validated by the shell guard. */
export function loadStagingEnv(filePath: string): void {
  const source = readFileSync(filePath, 'utf8');
  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) throw new Error(`Invalid environment assignment in ${filePath}`);
    const [, key, rawValue] = match;
    let value = rawValue.trim();
    if ((value.startsWith('"') && value.endsWith('"'))
        || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}
