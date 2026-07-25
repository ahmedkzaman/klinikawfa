import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('dispensary item removal confirmation', () => {
  it('names the item and requires confirmation before removal', () => {
    const source = readFileSync(
      resolve(
        process.cwd(),
        'src/components/clinic/visit/VisitDetailsColumn.tsx',
      ),
      'utf8',
    );

    expect(source).toContain('<AlertDialog');
    expect(source).toContain('pendingRemoval?.item_name');
    expect(source).toContain('Remove item?');
    expect(source).toContain('Confirm removal');
  });
});
