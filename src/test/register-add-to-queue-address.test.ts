import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  join(process.cwd(), 'src/components/clinic/RegisterAndCheckInDialog.tsx'),
  'utf8',
);

describe('Register & Add to Queue address capture', () => {
  it('exposes and saves patient address when registering directly into the queue', () => {
    expect(source).toContain('address: z.string().trim().max(500).optional()');
    expect(source).toContain("address: '',");
    expect(source).toContain("address: ep.address ?? ''");
    expect(source).toContain("if (data.address)");
    expect(source).toContain("setValue('address', toUpperSafe(data.address)");
    expect(source).toContain("address: data.address ? toUpperSafe(data.address) : null");
    expect(source).toContain('htmlFor="reg-address"');
    expect(source).toContain('{...register(\'address\')}');
  });
});
