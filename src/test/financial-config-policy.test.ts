import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';

const migrationPath = resolve(
  process.cwd(),
  'stress-tests/proposed-migrations/20260717143000_financial_configuration_read_boundaries.sql',
);
const rollbackPath = resolve(
  process.cwd(),
  'stress-tests/rollback/financial_configuration_read_boundaries_rollback.sql',
);

const migration = readFileSync(migrationPath, 'utf8');
const rollback = readFileSync(rollbackPath, 'utf8');

describe('financial configuration read-boundary proposal', () => {
  test('creates exactly the three approved replacement SELECT policies', () => {
    const creates = migration.match(/CREATE POLICY/g) ?? [];
    expect(creates).toHaveLength(3);
    expect(migration).toContain('"clinic_settings_clinic_roles_read"');
    expect(migration).toContain('"insurance_providers_clinic_roles_read"');
    expect(migration).toContain('"payment_methods_ops_read"');
  });

  test('uses clinic-role checks for shared clinic and panel data', () => {
    expect(migration).toContain(
      'USING (public.is_staff_or_clinical(auth.uid()));',
    );
    expect(
      migration.match(/USING \(public\.is_staff_or_clinical\(auth\.uid\(\)\)\);/g),
    ).toHaveLength(2);
  });

  test('keeps payment-provider account details operations/admin-only', () => {
    expect(migration).toContain(
      'USING (public.is_ops_or_admin(auth.uid()));',
    );
  });

  test('contains no data mutation or schema/content rewrite', () => {
    expect(migration).not.toMatch(/\b(?:INSERT|UPDATE|DELETE|ALTER TABLE)\b/i);
    expect(migration).not.toMatch(/\bDROP TABLE\b/i);
  });

  test('fails closed on policy drift and blanket SELECT access', () => {
    expect(migration).toContain('actual IS DISTINCT FROM expected_old');
    expect(migration).toContain('actual IS DISTINCT FROM expected_final');
    expect(migration).toContain("= 'true'");
    expect(migration).toContain('blanket_count <> 0');
  });

  test('rollback restores the exact captured policies', () => {
    expect(rollback.match(/CREATE POLICY/g) ?? []).toHaveLength(3);
    expect(rollback).toContain('"Authenticated can read clinic settings"');
    expect(rollback).toContain('"Authenticated can read insurance_providers"');
    expect(rollback).toContain('"payment_methods_authenticated_select"');
    expect(rollback.match(/USING \(true\);/g) ?? []).toHaveLength(3);
  });
});
