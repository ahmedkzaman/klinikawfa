import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const hookSource = readFileSync(
  resolve('src/hooks/clinic/useQueueEntries.ts'),
  'utf8',
);

describe('Queue Board completed visit dates', () => {
  it('filters completed visits by the preserved visit date, not the later update timestamp', () => {
    const completedHook = hookSource.slice(
      hookSource.indexOf('export function useCompletedTodayEntries'),
      hookSource.indexOf('export function', hookSource.indexOf('export function useCompletedTodayEntries') + 1),
    );

    expect(completedHook).toMatch(/\.gte\("created_at", start\)/);
    expect(completedHook).toMatch(/\.lt\("created_at", end\)/);
    expect(completedHook).toMatch(/\.order\("created_at", \{ ascending: false \}\)/);
    expect(completedHook).not.toMatch(/[.(]updated_at/);
  });
});
