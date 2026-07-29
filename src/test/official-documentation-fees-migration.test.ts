import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationPath = resolve(
  process.cwd(),
  'supabase/migrations/20260729050026_add_official_documentation_fees.sql',
);

describe('official documentation fees migration', () => {
  const sql = readFileSync(migrationPath, 'utf8');

  it('creates a protected three-price configuration with exact RM15 defaults', () => {
    expect(sql).toMatch(/create table public\.clinic_document_fees/i);
    expect(sql).toMatch(/document_type text primary key/i);
    expect(sql).toMatch(/amount numeric\(10,\s*2\)/i);
    expect(sql).toMatch(/values\s*\('mc',\s*15\.00\)/i);
    expect(sql).toMatch(/values\s*\('prescription',\s*15\.00\)/i);
    expect(sql).toMatch(/values\s*\('referral',\s*15\.00\)/i);
    expect(sql).toMatch(
      /alter table public\.clinic_document_fees enable row level security/i,
    );
    expect(sql).toMatch(
      /grant select on table public\.clinic_document_fees to authenticated/i,
    );
    expect(sql).not.toMatch(
      /grant (insert|update|delete|all)[\s\S]*clinic_document_fees[\s\S]*to authenticated/i,
    );
  });

  it('enforces the exact document-type price-editing role branches', () => {
    const setter = sql.match(
      /create or replace function public\.set_clinic_document_fee[\s\S]*?\$function\$;/i,
    )?.[0] ?? '';

    expect(setter).toMatch(/_document_type text[\s\S]*_amount numeric/i);
    expect(setter).toMatch(/returns public\.clinic_document_fees/i);
    expect(setter).toMatch(/'mc'/i);
    expect(setter).toMatch(/'ops_staff'/i);
    expect(setter).toMatch(/'operations'/i);
    expect(setter).toMatch(/'staff'/i);
    expect(setter).toMatch(/'resident_doctor'/i);
    expect(setter).toMatch(/'admin'/i);
    expect(setter).toMatch(/'doctor_admin'/i);
    expect(setter).toMatch(/'prescription'[\s\S]*'referral'/i);
    expect(setter).toMatch(/not_authorized/i);
    expect(setter).toMatch(/round\(_amount,\s*2\)\s*<>\s*_amount/i);
  });

  it('links at most one active billing item to each issued document', () => {
    expect(sql).toMatch(
      /alter table public\.consultation_items[\s\S]*source_document_id uuid[\s\S]*source_document_type text/i,
    );
    expect(sql).toMatch(
      /create unique index[\s\S]*source_document_id[\s\S]*where deleted_at is null/i,
    );
    expect(sql).toContain('Official Documentation Fees');
  });

  it('issues and voids the document and charge through guarded locked transactions', () => {
    const issue = sql.match(
      /create or replace function public\.issue_consultation_document_with_fee[\s\S]*?\$function\$;/i,
    )?.[0] ?? '';
    const voidDocument = sql.match(
      /create or replace function public\.void_consultation_document_with_fee[\s\S]*?\$function\$;/i,
    )?.[0] ?? '';

    expect(issue).toMatch(/_document_id uuid/i);
    expect(issue).toMatch(/returns public\.consultation_documents/i);
    expect(issue).toMatch(/security invoker/i);
    expect(issue).toMatch(/is_staff_or_clinical\(auth\.uid\(\)\)/i);
    expect(issue).toMatch(/for update/i);
    expect(issue).toMatch(
      /insert into public\.consultation_documents[\s\S]*on conflict \(id\) do nothing/i,
    );

    expect(voidDocument).toMatch(/returns void/i);
    expect(voidDocument).toMatch(/security invoker/i);
    expect(voidDocument).toMatch(/is_staff_or_clinical\(auth\.uid\(\)\)/i);
    expect(voidDocument).toMatch(/for update/i);
    expect(voidDocument).toMatch(/delete from public\.consultation_documents/i);

    expect(sql).toMatch(
      /create or replace function public\.sync_consultation_document_fee[\s\S]*security definer/i,
    );
    expect(sql).toMatch(/lock_completed_bill_item_mutation_boundary/i);
    expect(sql).toMatch(/completed_bill_correction_guard/i);
    expect(sql).toMatch(/ensure_panel_claim_for_queue/i);
    expect(sql).toMatch(
      /insert into public\.consultation_items[\s\S]*on conflict \(source_document_id\)[\s\S]*where deleted_at is null\s*do nothing/i,
    );
    expect(sql).toMatch(
      /revoke all on function public\.sync_consultation_document_fee\(\)\s*from public,\s*anon,\s*authenticated/i,
    );
  });

  it('exposes only the three reviewed RPCs to authenticated callers', () => {
    for (const signature of [
      'set_clinic_document_fee',
      'issue_consultation_document_with_fee',
      'void_consultation_document_with_fee',
    ]) {
      expect(sql).toMatch(
        new RegExp(
          `revoke all on function public\\.${signature}[\\s\\S]*from public[\\s\\S]*from anon[\\s\\S]*grant execute on function public\\.${signature}[\\s\\S]*to authenticated`,
          'i',
        ),
      );
    }
  });
});
