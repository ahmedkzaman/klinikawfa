import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const directory = resolve(process.cwd(), 'supabase/migrations');
const migrationName = readdirSync(directory).find((name) =>
  name.endsWith('_add_quarantine_documentation_fee.sql'),
);
const sql = migrationName ? readFileSync(resolve(directory, migrationName), 'utf8') : '';

describe('quarantine official documentation fee migration', () => {
  it('adds quarantine to the configurable fee and linked billing lifecycle', () => {
    expect(migrationName).toBeDefined();
    expect(sql).toMatch(/values\s*\(\s*'quarantine'\s*,\s*15(?:\.00)?\s*\)/i);
    expect(sql).toMatch(/document_type in \('mc', 'prescription', 'referral', 'quarantine'\)/i);
    expect(sql).toMatch(/source_document_type in \('mc', 'prescription', 'referral', 'quarantine'\)/i);
    expect(sql).toMatch(/v_document_type not in \('mc', 'prescription', 'referral', 'quarantine'\)/i);
  });
});
