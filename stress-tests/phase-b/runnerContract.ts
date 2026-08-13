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
  preflight?: PhaseBCommand;
  setup: PhaseBCommand;
  scenarios: PhaseBCommand[];
  validate?: PhaseBCommand;
  teardown: PhaseBCommand;
}): void {
  // Authentication is a true preflight: an invalid/expired token must not
  // cause setup or even cleanup writes against the staging fixture namespace.
  if (input.preflight) execute(input.spawn, input.preflight);

  let primaryError: Error | null = null;
  let setupSucceeded = false;
  try {
    execute(input.spawn, input.setup);
    setupSucceeded = true;
    for (const scenario of input.scenarios) execute(input.spawn, scenario);
  } catch (error) {
    primaryError = error instanceof Error ? error : new Error(String(error));
  }

  // Preserve the raced state long enough to inspect invariants even when a
  // k6 check failed. A failed setup is the exception: its partial state is
  // cleaned directly because the validation fixture is not trustworthy.
  if (setupSucceeded && input.validate) {
    try {
      execute(input.spawn, input.validate);
    } catch (error) {
      const validationError = error instanceof Error ? error : new Error(String(error));
      primaryError = primaryError
        ? new Error(`${primaryError.message}; ${validationError.message}`)
        : validationError;
    }
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
