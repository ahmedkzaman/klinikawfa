import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationsDirectory = resolve(process.cwd(), 'supabase/migrations');
const correctiveMigrationName = readdirSync(migrationsDirectory).find((name) =>
  name.endsWith('_fix_official_document_void_rls_lock.sql'),
);
const sql = correctiveMigrationName
  ? readFileSync(resolve(migrationsDirectory, correctiveMigrationName), 'utf8')
  : '';

describe('official documentation fee corrective migration', () => {
  it('removes invoker consultation row locks that completed-correction RLS hides', () => {
    expect(correctiveMigrationName).toBeDefined();

    const issue = sql.match(
      /create or replace function public\.issue_consultation_document_with_fee[\s\S]*?\$function\$;/i,
    )?.[0] ?? '';
    const voidDocument = sql.match(
      /create or replace function public\.void_consultation_document_with_fee[\s\S]*?\$function\$;/i,
    )?.[0] ?? '';

    expect(issue).toMatch(/security invoker/i);
    expect(issue).toMatch(/is_staff_or_clinical\(auth\.uid\(\)\)/i);
    expect(issue).toMatch(
      /from public\.queue_entries qe[\s\S]*where qe\.id = v_queue_entry_id[\s\S]*for update/i,
    );
    expect(issue).not.toMatch(
      /from public\.consultations c\s+where c\.id = _consultation_id\s+for update/i,
    );

    expect(voidDocument).toMatch(/security invoker/i);
    expect(voidDocument).toMatch(/is_staff_or_clinical\(auth\.uid\(\)\)/i);
    expect(voidDocument).toMatch(
      /from public\.queue_entries qe[\s\S]*where qe\.id = v_queue_entry_id[\s\S]*for update/i,
    );
    expect(voidDocument).toMatch(
      /from public\.consultation_documents cd[\s\S]*where cd\.id = _document_id[\s\S]*for update/i,
    );
    expect(voidDocument).not.toMatch(
      /from public\.consultations c\s+where c\.id = v_consultation_id\s+for update/i,
    );
    expect(voidDocument).toMatch(
      /delete from public\.consultation_documents[\s\S]*returning id into v_deleted_id/i,
    );
  });

  it('does not broaden RLS or expose a security-definer RPC', () => {
    expect(sql).not.toMatch(/\bsecurity definer\b/i);
    expect(sql).not.toMatch(/\b(create|alter|drop) policy\b/i);
    expect(sql).not.toMatch(
      /create or replace function public\.sync_consultation_document_fee/i,
    );

    expect(sql).toMatch(
      /revoke all on function public\.issue_consultation_document_with_fee[\s\S]*from public[\s\S]*from anon[\s\S]*grant execute on function public\.issue_consultation_document_with_fee[\s\S]*to authenticated/i,
    );
    expect(sql).toMatch(
      /revoke all on function public\.void_consultation_document_with_fee[\s\S]*from public[\s\S]*from anon[\s\S]*grant execute on function public\.void_consultation_document_with_fee[\s\S]*to authenticated/i,
    );
  });
});
