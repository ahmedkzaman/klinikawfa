import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { runPhaseBCommands, type PhaseBCommand } from '../../stress-tests/phase-b/runnerContract';

const command = (label: string): PhaseBCommand => ({ label, command: label, args: [] });

describe('Phase B runner failure contract', () => {
  it('propagates setup failure and still attempts teardown', () => {
    const spawn = vi.fn()
      .mockReturnValueOnce({ status: 2 })
      .mockReturnValueOnce({ status: 0 });

    expect(() => runPhaseBCommands({
      spawn, setup: command('setup'), scenarios: [command('k6')], teardown: command('teardown'),
    })).toThrow('setup failed with exit code 2');
    expect(spawn).toHaveBeenCalledTimes(2);
    expect(spawn.mock.calls[1][0]).toBe('teardown');
  });

  it('propagates k6 and teardown failures', () => {
    const spawn = vi.fn()
      .mockReturnValueOnce({ status: 0 })
      .mockReturnValueOnce({ status: 3 })
      .mockReturnValueOnce({ status: 4 });

    expect(() => runPhaseBCommands({
      spawn, setup: command('setup'), scenarios: [command('k6')], teardown: command('teardown'),
    })).toThrow(/k6 failed with exit code 3[\s\S]*teardown failed with exit code 4/i);
    expect(spawn).toHaveBeenCalledTimes(3);
  });

  it('runs authentication preflight and invariants before teardown', () => {
    const spawn = vi.fn().mockReturnValue({ status: 0 });
    const input = {
      spawn,
      preflight: command('auth-preflight'),
      setup: command('setup'),
      scenarios: [command('k6')],
      validate: command('validate'),
      teardown: command('teardown'),
    } as Parameters<typeof runPhaseBCommands>[0] & {
      preflight: PhaseBCommand;
      validate: PhaseBCommand;
    };

    runPhaseBCommands(input);
    expect(spawn.mock.calls.map(([program]) => program)).toEqual([
      'auth-preflight', 'setup', 'k6', 'validate', 'teardown',
    ]);
  });

  it('does not mutate fixtures when authentication preflight fails', () => {
    const spawn = vi.fn().mockReturnValue({ status: 2 });

    expect(() => runPhaseBCommands({
      spawn,
      preflight: command('auth-preflight'),
      setup: command('setup'),
      scenarios: [command('k6')],
      validate: command('validate'),
      teardown: command('teardown'),
    })).toThrow('auth-preflight failed with exit code 2');
    expect(spawn.mock.calls.map(([program]) => program)).toEqual(['auth-preflight']);
  });

  it('validates failed race state before cleaning fixtures', () => {
    const spawn = vi.fn()
      .mockReturnValueOnce({ status: 0 })
      .mockReturnValueOnce({ status: 3 })
      .mockReturnValueOnce({ status: 0 })
      .mockReturnValueOnce({ status: 0 });

    expect(() => runPhaseBCommands({
      spawn,
      setup: command('setup'),
      scenarios: [command('k6')],
      validate: command('validate'),
      teardown: command('teardown'),
    })).toThrow('k6 failed with exit code 3');
    expect(spawn.mock.calls.map(([program]) => program)).toEqual([
      'setup', 'k6', 'validate', 'teardown',
    ]);
  });

  it('uses real RPC arguments and mutation-shaped race assertions', () => {
    const fefo = readFileSync('stress-tests/phase-b/fefo-race.k6.js', 'utf8');
    const queue = readFileSync('stress-tests/phase-b/queue-status-race.k6.js', 'utf8');
    const checkout = readFileSync('stress-tests/phase-b/checkout-race.k6.js', 'utf8');
    expect(fefo).toContain('_item_id');
    expect(fefo).toContain('_qty');
    expect(fefo).toMatch(/status\s*(?:===|!==)\s*200/);
    expect(fefo).toMatch(/PGRST(?:202|203)|function[^\n]*not found/i);
    expect(queue).toMatch(/JSON\.parse|\.json\(/);
    expect(queue).toMatch(/with_doctor/);
    expect(checkout).toContain('INVALID_CHECKOUT_STATUS');
  });

  it('resets fixtures and loads documented staff auth into the parent runner', () => {
    const setup = readFileSync('stress-tests/phase-b/setup-targets.sql', 'utf8');
    const orchestrate = readFileSync('stress-tests/orchestrate.ts', 'utf8');
    const example = readFileSync('stress-tests/.env.staging.example', 'utf8');
    const readme = readFileSync('stress-tests/README.md', 'utf8');
    expect(setup).toMatch(/teardown-targets\.sql|delete from public\.payments/i);
    expect(orchestrate).toMatch(/loadStagingEnv|\.env\.staging/);
    expect(example).toContain('STAGING_AUTH_TOKEN=');
    expect(readme).toMatch(/STAGING_AUTH_TOKEN[\s\S]*(?:staff JWT|access_token)/i);
    expect(readme).toMatch(/auth\/v1\/(?:token|user)/i);
  });
});
