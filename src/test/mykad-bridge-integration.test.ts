import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const readerHook = readFileSync(
  join(process.cwd(), 'src/hooks/clinic/useMyKadReader.ts'),
  'utf8',
);
const statusHook = readFileSync(
  join(process.cwd(), 'src/hooks/useMyKadBridge.ts'),
  'utf8',
);
const queueDialog = readFileSync(
  join(process.cwd(), 'src/components/clinic/RegisterAndCheckInDialog.tsx'),
  'utf8',
);

describe('MyKad bridge integration', () => {
  it('uses localhost consistently for reads and status checks', () => {
    expect(readerHook).toContain("'http://localhost:8787/read-mykad'");
    expect(statusHook).toContain("'http://localhost:8787/read-mykad'");
    expect(statusHook).not.toContain('http://127.0.0.1:8787');
    expect(statusHook).toContain("+ '/health'");
    expect(statusHook).not.toContain("+ '/status'");
  });

  it('allows more time than the adapter 30-second reader timeout', () => {
    expect(readerHook).toContain('AbortSignal.timeout(40_000)');
    expect(queueDialog).not.toContain("new Error('bridge_timeout')");
  });

  it('shows only the reader hook error when a read fails', () => {
    expect(queueDialog).not.toContain(
      "toast.message('MyKad reader unavailable — type IC manually.')",
    );
  });

  it('does not claim the health endpoint can detect card presence', () => {
    expect(queueDialog).toContain("label: 'MyKad bridge connected'");
    expect(queueDialog).not.toContain("label: 'Reader connected — no card'");
  });
});
