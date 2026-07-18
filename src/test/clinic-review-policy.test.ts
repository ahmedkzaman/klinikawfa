import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';

function readRepoFile(path: string): string {
  const absolute = resolve(process.cwd(), path);
  return existsSync(absolute) ? readFileSync(absolute, 'utf8') : '';
}

const migration = readRepoFile(
  'supabase/migrations/20260718190000_harden_clinic_review_reads.sql',
);

describe('clinic review read boundary', () => {
  test('removes blanket authenticated access to every review', () => {
    expect(migration).toContain(
      'DROP POLICY IF EXISTS "Authenticated can read clinic_reviews" ON public.clinic_reviews;',
    );
    expect(migration).toContain(
      'CREATE POLICY "Operations can read all clinic_reviews"',
    );
    expect(migration).toContain('public.is_ops_or_admin(auth.uid())');
    expect(migration).not.toMatch(
      /CREATE POLICY "Operations can read all clinic_reviews"[\s\S]*?USING \(true\)/,
    );
  });

  test('preserves public reads only for active reviews', () => {
    expect(migration).toContain(
      'CREATE POLICY "Public can read clinic_reviews active"',
    );
    expect(migration).toContain("USING (status = 'active')");
  });

  test('fails closed when the expected helper or policies are absent', () => {
    expect(migration).toContain(
      "to_regprocedure('public.is_ops_or_admin(uuid)') IS NULL",
    );
    expect(migration).toContain(
      "RAISE EXCEPTION 'clinic-reviews postflight failed",
    );
  });
});
