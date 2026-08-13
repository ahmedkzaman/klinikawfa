import { describe, expect, it, vi } from 'vitest';
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
});
