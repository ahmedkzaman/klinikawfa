import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationPath = resolve(
  process.cwd(),
  'supabase/migrations/20260802190000_add_offline_consultation_approval.sql',
);
const sql = existsSync(migrationPath) ? readFileSync(migrationPath, 'utf8') : '';

describe('offline consultation approval migration', () => {
  it('creates the server-controlled approval state and immutable audit log', () => {
    expect(sql).toMatch(/add column if not exists entry_source text not null default 'live'/i);
    expect(sql).toMatch(/add column if not exists entered_by uuid references auth\.users\(id\)/i);
    expect(sql).toMatch(/add column if not exists original_consulted_at timestamptz/i);
    expect(sql).toMatch(/add column if not exists approval_status text not null default 'not_required'/i);
    expect(sql).toMatch(/add column if not exists approved_by uuid references auth\.users\(id\)/i);
    expect(sql).toMatch(/add column if not exists approved_at timestamptz/i);
    expect(sql).toMatch(/add column if not exists returned_by uuid references auth\.users\(id\)/i);
    expect(sql).toMatch(/add column if not exists returned_at timestamptz/i);
    expect(sql).toMatch(/add column if not exists return_reason text/i);
    expect(sql).toMatch(/add column if not exists approval_revision integer not null default 0/i);
    expect(sql).toMatch(/check \(entry_source in \('live', 'offline_transcription'\)\)/i);
    expect(sql).toMatch(/check \(approval_status in \('not_required', 'pending', 'returned', 'approved'\)\)/i);
    expect(sql).toMatch(/create table if not exists public\.consultation_approval_audit/i);
    expect(sql).toMatch(/snapshot jsonb not null default '\{\}'::jsonb/i);
    expect(sql).toMatch(/jsonb_typeof\(snapshot\) = 'object'/i);
    expect(sql).toMatch(/pg_column_size\(snapshot\) <= 16384/i);
    expect(sql).toMatch(/alter table public\.consultation_approval_audit enable row level security/i);
    expect(sql).toMatch(/revoke all privileges on table public\.consultation_approval_audit from public, anon, authenticated/i);
    expect(sql).toMatch(/create policy consultation_approval_audit_read/i);
    expect(sql).not.toMatch(/grant (insert|update|delete|all) on table public\.consultation_approval_audit to authenticated/i);
  });

  it('provides only hardened authenticated approval RPCs', () => {
    for (const signature of [
      'save_offline_consultation',
      'review_offline_consultation',
      'get_offline_consultation_audit',
    ]) {
      expect(sql).toMatch(
        new RegExp(
          `revoke all on function public\\.${signature}[\\s\\S]*from public[\\s\\S]*from anon[\\s\\S]*grant execute on function public\\.${signature}[\\s\\S]*to authenticated`,
          'i',
        ),
      );
    }

    expect(sql).toMatch(/create or replace function public\.save_offline_consultation\([\s\S]*p_queue_entry_id uuid[\s\S]*p_doctor_id uuid[\s\S]*p_original_consulted_at timestamptz[\s\S]*p_case_note text[\s\S]*p_diagnosis_id uuid[\s\S]*p_diagnosis_text text[\s\S]*p_dispense_note text[\s\S]*p_expected_revision integer[\s\S]*returns public\.consultations/i);
    expect(sql).toMatch(/create or replace function public\.review_offline_consultation\([\s\S]*p_consultation_id uuid[\s\S]*p_action text[\s\S]*p_reason text default null[\s\S]*p_expected_revision integer default null[\s\S]*returns public\.consultations/i);
    expect(sql).toMatch(/create or replace function public\.get_offline_consultation_audit\([\s\S]*returns table\(\s*id uuid,\s*action text,\s*actor_id uuid,\s*actor_name text,\s*created_at timestamptz,\s*reason text\s*\)/i);
    expect(sql).toMatch(/security definer/i);
    expect(sql).toMatch(/set search_path = pg_catalog, public/i);
  });

  it('enforces the offline entry state machine and protected provenance', () => {
    const save = sql.match(
      /create or replace function public\.save_offline_consultation[\s\S]*?\$function\$;/i,
    )?.[0] ?? '';

    expect(save).toMatch(/min\(role::text\) = 'ops_staff'/i);
    expect(save).toMatch(/v_actor_id uuid := auth\.uid\(\)/i);
    expect(save).toMatch(/from public\.queue_entries[\s\S]*for update/i);
    expect(save).toMatch(/from public\.doctors[\s\S]*on_duty[\s\S]*public\.is_clinical/i);
    expect(save).toMatch(/from public\.consultations[\s\S]*for update/i);
    expect(save).toMatch(/duplicate_offline_consultation/i);
    expect(save).toMatch(/entry_source,\s*entered_by,\s*original_consulted_at,\s*approval_status/i);
    expect(save).toMatch(/'offline_transcription',\s*v_actor_id,\s*p_original_consulted_at,\s*'pending'/i);
    expect(save).toMatch(/approval_revision = approval_revision \+ 1/i);
    expect(save).toMatch(/v_consultation\.approval_status not in \('pending', 'returned'\)/i);
    expect(save).toMatch(/stale_offline_consultation/i);
    expect(save).toMatch(/doctor_reassigned/i);
    expect(save).toMatch(/returned_by = null[\s\S]*returned_at = null[\s\S]*return_reason = null/i);
    expect(save).toMatch(/insert into public\.consultation_approval_audit/i);

    expect(sql).toMatch(/create or replace function public\.guard_offline_consultation_provenance/i);
    expect(sql).toMatch(/offline_consultation_provenance_managed_by_rpc/i);
    expect(sql).toMatch(/create trigger guard_offline_consultation_provenance/i);
    expect(sql).toMatch(/create policy consultations_offline_direct_insert_denied/i);
    expect(sql).toMatch(/create policy consultations_offline_direct_update_denied/i);
  });

  it('allows only the consulting doctor or doctor administrator to review pending entries', () => {
    const review = sql.match(
      /create or replace function public\.review_offline_consultation[\s\S]*?\$function\$;/i,
    )?.[0] ?? '';

    expect(review).toMatch(/from public\.consultations[\s\S]*for update/i);
    expect(review).toMatch(/v_consultation\.approval_status <> 'pending'/i);
    expect(review).toMatch(/v_consultation\.doctor_id[\s\S]*v_actor_id/i);
    expect(review).toMatch(/role::text = 'doctor_admin'/i);
    expect(review).toMatch(/not_authorized_offline_consultation_review/i);
    expect(review).toMatch(/v_action not in \('approve', 'return'\)/i);
    expect(review).toMatch(/return_reason_required/i);
    expect(review).toMatch(/approval_status = 'approved'[\s\S]*approved_by = v_actor_id[\s\S]*approved_at = now\(\)/i);
    expect(review).toMatch(/approval_status = 'returned'[\s\S]*returned_by = v_actor_id[\s\S]*returned_at = now\(\)/i);
    expect(review).toMatch(/id = v_consultation\.doctor_id/i);
    expect(review).toMatch(/approval_revision = approval_revision \+ 1/i);
    expect(review).toMatch(/insert into public\.consultation_approval_audit/i);
    expect(review).not.toMatch(/update public\.consultations[\s\S]*doctor_id\s*=/i);
  });

  it('keeps checkout independent and verifies the deployed security contract', () => {
    expect(sql).not.toMatch(/create or replace function public\.(checkout_visit|record_payment_and_complete_visit)/i);
    expect(sql).toMatch(/consultation_approval_audit_consultation_created_idx/i);
    expect(sql).toMatch(/consultations_offline_approval_worklist_idx/i);
    expect(sql).toMatch(/offline consultation postflight failed/i);
    expect(sql).toMatch(/has_function_privilege\('anon'/i);
    expect(sql).toMatch(/has_function_privilege\('anon'/i);
    expect(sql).toMatch(/has_table_privilege\('authenticated'/i);
    expect(sql).toMatch(/locum/i);
  });
});
