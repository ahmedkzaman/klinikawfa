import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';

function readRepoFile(path: string): string {
  const absolute = resolve(process.cwd(), path);
  return existsSync(absolute) ? readFileSync(absolute, 'utf8') : '';
}

const migration = readRepoFile(
  'supabase/migrations/20260718183000_harden_visit_attachment_reads.sql',
);

describe('visit attachment read boundary', () => {
  test('removes blanket authenticated metadata access', () => {
    expect(migration).toContain(
      'DROP POLICY IF EXISTS "attachments_read" ON public.consultation_attachments;',
    );
    expect(migration).toContain(
      'CREATE POLICY "attachments_scoped_read"',
    );
    expect(migration).toContain('public.is_ops_or_admin(auth.uid())');
    expect(migration).toContain(
      'public.is_current_user_consultation_doctor(consultation_id)',
    );
    expect(migration).not.toMatch(
      /consultation_attachments[\s\S]*?CREATE POLICY[\s\S]*?USING \(true\)/,
    );
  });

  test('requires an authorized consultation relationship for storage reads', () => {
    expect(migration).toContain(
      'DROP POLICY IF EXISTS "visit_attachment_read" ON storage.objects;',
    );
    expect(migration).toContain('CREATE POLICY "visit_attachment_read"');
    expect(migration).toContain("bucket_id = 'visit-attachment'");
    expect(migration).toContain('EXISTS (');
    expect(migration).toContain('ca.file_path = storage.objects.name');
    expect(migration).toContain(
      'public.is_current_user_consultation_doctor(ca.consultation_id)',
    );
    expect(migration).not.toContain(
      "USING (bucket_id = 'visit-attachment');",
    );
  });

  test('fails closed if helpers or final policies are missing', () => {
    expect(migration).toContain(
      "to_regprocedure('public.is_ops_or_admin(uuid)') IS NULL",
    );
    expect(migration).toContain(
      "to_regprocedure('public.is_current_user_consultation_doctor(uuid)') IS NULL",
    );
    expect(migration).toContain(
      "RAISE EXCEPTION 'visit-attachment postflight failed",
    );
  });
});
