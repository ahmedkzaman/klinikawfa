import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('dispensary item price editing', () => {
  it('renders the price editor for catalog and manual items', () => {
    const source = readFileSync(
      resolve(
        process.cwd(),
        'src/components/clinic/visit/VisitDetailsColumn.tsx',
      ),
      'utf8',
    );
    const controls = source.slice(
      source.indexOf('{/* Inline quantity'),
      source.indexOf('{/* Right rail:'),
    );

    expect(controls).toContain('<PriceInput');
    expect(controls).not.toContain('item.item_id == null');
    expect(controls).not.toContain('item.service_id == null');
    expect(controls).not.toContain('item.package_id == null');
  });
});
