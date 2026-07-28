import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('completed bill correction migration', () => {
  it('defines the guarded atomic correction boundary and immutable audit contract', () => {
    const migrationsDirectory = resolve(process.cwd(), 'supabase/migrations');
    const matches = readdirSync(migrationsDirectory)
      .filter((name) => name.endsWith('_add_completed_bill_corrections.sql'));

    expect(matches).toHaveLength(1);

    const sql = readFileSync(resolve(migrationsDirectory, matches[0]), 'utf8');

    expect(sql).toMatch(/create table public\.completed_bill_correction_audit/i);
    expect(sql).toMatch(
      /alter table public\.completed_bill_correction_audit enable row level security/i,
    );
    expect(sql).toMatch(
      /create or replace function public\.get_completed_bill_correction_context/i,
    );
    expect(sql).toMatch(/create or replace function public\.correct_completed_bill/i);
    expect(sql).toMatch(/security definer/i);
    expect(sql).toMatch(/set search_path\s*=\s*public,\s*pg_temp/i);
    expect(sql).toMatch(/for update/i);
    expect(sql).toMatch(/stale_bill/i);
    expect(sql).toMatch(/doctor_admin/i);
    expect(sql).toMatch(/ops_staff/i);
    expect(sql).toMatch(/billing_adjustment_kind/i);
    expect(sql).toMatch(/dispensed_qty/i);
    expect(sql).toMatch(/ensure_panel_claim_for_queue/i);
    expect(sql).toMatch(/before_state/i);
    expect(sql).toMatch(/after_state/i);
    expect(sql).toMatch(
      /revoke all on function public\.correct_completed_bill[\s\S]*from public/i,
    );
    expect(sql).toMatch(
      /revoke all on function public\.correct_completed_bill[\s\S]*from anon/i,
    );
    expect(sql).toMatch(
      /grant execute on function public\.correct_completed_bill[\s\S]*to authenticated/i,
    );
  });

  it('suppresses legacy inventory allocation only inside a guarded completed correction', () => {
    const migrationsDirectory = resolve(process.cwd(), 'supabase/migrations');
    const [migration] = readdirSync(migrationsDirectory)
      .filter((name) => name.endsWith('_add_completed_bill_corrections.sql'));
    const sql = readFileSync(resolve(migrationsDirectory, migration), 'utf8');

    expect(sql).toMatch(
      /create table public\.completed_bill_correction_guard[\s\S]*revoke all privileges on table public\.completed_bill_correction_guard from public,\s*anon,\s*authenticated/i,
    );
    expect(sql).toMatch(
      /create or replace function public\.trg_consultation_items_inventory[\s\S]*completed_bill_correction_guard[\s\S]*transaction_id = txid_current\(\)[\s\S]*backend_pid = pg_backend_pid\(\)[\s\S]*actor_id = auth\.uid\(\)[\s\S]*c\.status = 'completed'[\s\S]*qe\.clinic_status = 'completed'[\s\S]*return new/i,
    );
    expect(sql).toMatch(
      /insert into public\.completed_bill_correction_guard\s*\([\s\S]*transaction_id[\s\S]*backend_pid[\s\S]*consultation_id[\s\S]*actor_id[\s\S]*txid_current\(\)[\s\S]*pg_backend_pid\(\)[\s\S]*v_consultation_id[\s\S]*auth\.uid\(\)/i,
    );
    expect(sql).toMatch(
      /delete from public\.completed_bill_correction_guard[\s\S]*transaction_id = txid_current\(\)[\s\S]*backend_pid = pg_backend_pid\(\)[\s\S]*consultation_id = v_consultation_id[\s\S]*actor_id = auth\.uid\(\)/i,
    );
    expect(sql).toMatch(
      /create or replace function public\.guard_completed_bill_item_mutation[\s\S]*completed_bill_correction_required[\s\S]*create trigger guard_completed_bill_item_mutation[\s\S]*before insert or update on public\.consultation_items/i,
    );

    const triggerReplacement = sql.match(
      /create or replace function public\.trg_consultation_items_inventory[\s\S]*?\$function\$;/i,
    )?.[0] ?? '';
    expect(triggerReplacement).toMatch(/reserve_inventory/i);
    expect(triggerReplacement).toMatch(/release_inventory/i);
  });

  it('protects soft-deleted completed parents and fails closed when parents cannot resolve', () => {
    const migrationsDirectory = resolve(process.cwd(), 'supabase/migrations');
    const [migration] = readdirSync(migrationsDirectory)
      .filter((name) => name.endsWith('_add_completed_bill_corrections.sql'));
    const sql = readFileSync(resolve(migrationsDirectory, migration), 'utf8');
    const itemGuard = sql.match(
      /create or replace function public\.guard_completed_bill_item_mutation[\s\S]*?\$function\$;/i,
    )?.[0] ?? '';
    const inventoryGuard = (
      sql.match(
        /create or replace function public\.trg_consultation_items_inventory[\s\S]*?\$function\$;/i,
      )?.[0] ?? ''
    ).split(/if tg_op/i)[0];

    expect(itemGuard).toMatch(/consultation_item_parent_state_unresolved/i);
    expect(itemGuard).toMatch(/c\.status = 'completed'|v_consultation_status = 'completed'/i);
    expect(itemGuard).toMatch(/qe\.clinic_status|v_queue_status/i);
    expect(itemGuard).not.toMatch(/c\.deleted_at|qe\.deleted_at/i);
    expect(inventoryGuard).not.toMatch(/c\.deleted_at|qe\.deleted_at/i);
  });

  it('serializes item mutation and checkout before taking deterministic parent locks', () => {
    const migrationsDirectory = resolve(process.cwd(), 'supabase/migrations');
    const [migration] = readdirSync(migrationsDirectory)
      .filter((name) => name.endsWith('_add_completed_bill_corrections.sql'));
    const sql = readFileSync(resolve(migrationsDirectory, migration), 'utf8');
    const itemGuard = sql.match(
      /create or replace function public\.guard_completed_bill_item_mutation[\s\S]*?\$function\$;/i,
    )?.[0] ?? '';
    const checkout = sql.match(
      /create or replace function public\.checkout_visit[\s\S]*?\$function\$;/i,
    )?.[0] ?? '';
    const correction = sql.match(
      /create or replace function public\.correct_completed_bill[\s\S]*?\$function\$;/i,
    )?.[0] ?? '';

    expect(sql).toMatch(
      /create or replace function public\.lock_completed_bill_item_mutation_boundary[\s\S]*pg_advisory_xact_lock/i,
    );
    expect(sql).toMatch(
      /create trigger serialize_consultation_item_mutation[\s\S]*before insert or update on public\.consultation_items[\s\S]*for each statement/i,
    );
    expect(itemGuard).toMatch(
      /from public\.queue_entries[\s\S]*for update[\s\S]*from public\.consultations[\s\S]*for update/i,
    );
    expect(checkout).toMatch(
      /lock_completed_bill_item_mutation_boundary\(\)[\s\S]*from public\.queue_entries[\s\S]*for update/i,
    );
    expect(correction).toMatch(
      /lock_completed_bill_item_mutation_boundary\(\)[\s\S]*from public\.queue_entries[\s\S]*for update/i,
    );
  });

  it('canonicalizes payment UUIDs before duplicate and full-set validation', () => {
    const migrationsDirectory = resolve(process.cwd(), 'supabase/migrations');
    const [migration] = readdirSync(migrationsDirectory)
      .filter((name) => name.endsWith('_add_completed_bill_corrections.sql'));
    const sql = readFileSync(resolve(migrationsDirectory, migration), 'utf8');

    expect(sql).toMatch(
      /group by\s+\(element->>'id'\)::uuid[\s\S]*having count\(\*\) > 1/i,
    );
    expect(sql).toMatch(
      /from public\.payments p[\s\S]*not exists\s*\([\s\S]*where \(element->>'id'\)::uuid = p\.id/i,
    );
  });

  it('keeps adjustment metadata owner-only and audit mutation privileges revoked', () => {
    const migrationsDirectory = resolve(process.cwd(), 'supabase/migrations');
    const [migration] = readdirSync(migrationsDirectory)
      .filter((name) => name.endsWith('_add_completed_bill_corrections.sql'));
    const sql = readFileSync(resolve(migrationsDirectory, migration), 'utf8');

    expect(sql).toMatch(
      /create policy "consultation_items_noncompleted_update"[\s\S]*billing_adjustment_kind is null[\s\S]*clinic_charge_type_id is null[\s\S]*with check[\s\S]*billing_adjustment_kind is null[\s\S]*clinic_charge_type_id is null/i,
    );
    expect(sql).toMatch(
      /create policy "consultation_items_noncompleted_insert"[\s\S]*billing_adjustment_kind is null[\s\S]*clinic_charge_type_id is null/i,
    );
    expect(sql).toMatch(
      /revoke all privileges on table public\.completed_bill_correction_audit from public,\s*anon,\s*authenticated/i,
    );
    expect(sql).toMatch(
      /grant select on table public\.completed_bill_correction_audit to authenticated/i,
    );
    expect(sql).toMatch(/has_table_privilege\(\s*'anon'[\s\S]*'truncate'\s*\)/i);
    expect(sql).toMatch(
      /has_table_privilege\(\s*'authenticated'[\s\S]*'truncate'\s*\)/i,
    );
  });

  it('normalizes every whitespace class before validating and storing reasons', () => {
    const migrationsDirectory = resolve(process.cwd(), 'supabase/migrations');
    const [migration] = readdirSync(migrationsDirectory)
      .filter((name) => name.endsWith('_add_completed_bill_corrections.sql'));
    const sql = readFileSync(resolve(migrationsDirectory, migration), 'utf8');

    expect(sql).toMatch(
      /create or replace function public\.normalize_completed_bill_correction_reason[\s\S]*chr\(160\)[\s\S]*chr\(8195\)[\s\S]*chr\(8239\)[\s\S]*chr\(65279\)/i,
    );
    expect(sql).toMatch(
      /v_reason\s*:=\s*public\.normalize_completed_bill_correction_reason\(p_reason\)/i,
    );
    expect(sql).toMatch(
      /reason text not null check[\s\S]*normalize_completed_bill_correction_reason\(reason\)/i,
    );
    expect(sql).not.toMatch(/\[\[:space:\]\]/i);
    expect(sql).not.toMatch(/trim\(p_reason\)/i);
  });
});
