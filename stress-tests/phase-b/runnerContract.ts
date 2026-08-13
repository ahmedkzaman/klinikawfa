import type { SpawnSyncOptions, SpawnSyncReturns } from 'node:child_process';

export interface PhaseBCommand {
  label: string;
  command: string;
  args: string[];
  options?: SpawnSyncOptions;
}

type Spawn = (
  command: string,
  args: readonly string[],
  options?: SpawnSyncOptions,
) => Pick<SpawnSyncReturns<Buffer>, 'status' | 'error'>;

function execute(spawn: Spawn, spec: PhaseBCommand): void {
  const result = spawn(spec.command, spec.args, spec.options);
  if (result.error) throw new Error(`${spec.label} failed: ${result.error.message}`);
  if (result.status !== 0) {
    throw new Error(`${spec.label} failed with exit code ${result.status ?? 'unknown'}`);
  }
}

export function runPhaseBCommands(input: {
  spawn: Spawn;
  setup: PhaseBCommand;
  scenarios: PhaseBCommand[];
  teardown: PhaseBCommand;
}): void {
  let primaryError: Error | null = null;
  try {
    execute(input.spawn, input.setup);
    for (const scenario of input.scenarios) execute(input.spawn, scenario);
  } catch (error) {
    primaryError = error instanceof Error ? error : new Error(String(error));
  }

  try {
    execute(input.spawn, input.teardown);
  } catch (error) {
    const teardownError = error instanceof Error ? error : new Error(String(error));
    if (primaryError) throw new Error(`${primaryError.message}; ${teardownError.message}`);
    throw teardownError;
  }

  if (primaryError) throw primaryError;
}
