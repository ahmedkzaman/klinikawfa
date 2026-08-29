import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';


const migrationsDir = resolve(process.cwd(), 'supabase/migrations');
const migrationName = readdirSync(migrationsDir).find((name) =>
  /^\d{14}_add_remedi_duplicate_retirement\.sql$/.test(name),
);
if (!migrationName) {
  throw new Error('CLI-generated add_remedi_duplicate_retirement migration is missing');
}
const sql = readFileSync(resolve(migrationsDir, migrationName), 'utf8');


const privateTables = ['remedi_retirement_batches', 'remedi_retired_rows'];


describe('Remedi duplicate retirement migration', () => {
  it('uses a CLI timestamp after the sales-import support migration', () => {
    expect(migrationName.slice(0, 14) > '20260828152615').toBe(true);
  });

  it('keeps every retirement ledger private, force-RLS protected, and ungranted', () => {
    for (const table of privateTables) {
      expect(sql).toMatch(
        new RegExp(`create\\s+table\\s+private\\.${table}\\b`, 'i'),
      );
      expect(sql).not.toMatch(
        new RegExp(`create\\s+table\\s+public\\.${table}\\b`, 'i'),
      );
      expect(sql).toMatch(
        new RegExp(`alter\\s+table\\s+private\\.${table}\\s+enable\\s+row\\s+level\\s+security`, 'i'),
      );
      expect(sql).toMatch(
        new RegExp(`alter\\s+table\\s+private\\.${table}\\s+force\\s+row\\s+level\\s+security`, 'i'),
      );
      expect(sql).toMatch(
        new RegExp(`revoke\\s+all\\s+on\\s+table\\s+private\\.${table}\\s+from\\s+public\\s*,\\s*anon\\s*,\\s*authenticated\\s*,\\s*service_role`, 'i'),
      );
    }
    expect(sql).not.toMatch(/create\s+policy[\s\S]*remedi_/i);
    expect(sql).not.toMatch(/grant[\s\S]{0,100}remedi_[\s\S]{0,100}service_role/i);
  });

  it('extends only the map status enums and no public clinical columns', () => {
    expect(sql).toMatch(/remedi_encounter_map_reconciliation_status_check[\s\S]*'retired_duplicate_of_live'/i);
    expect(sql).toMatch(/remedi_invoice_map_reconciliation_status_check[\s\S]*'retired_duplicate_of_live'/i);
    // original statuses preserved
    expect(sql).toMatch(/'historical_import',\s*'financial_paired',\s*'financial_quarantined',\s*'retired_duplicate_of_live'/i);
    expect(sql).toMatch(/'mixed_panel_self_pay',\s*'zero_total_ledger_only',\s*'retired_duplicate_of_live'/i);
    expect(sql).not.toMatch(/alter\s+table\s+public\.(patients|queue_entries|consultations|payments|panel_claims|consultation_items|vital_signs)\s+(?!(drop|add)\s+constraint)/i);
    // No PHI VALUES inserts (restore uses jsonb_populate_record, not literal values)
    expect(sql).not.toMatch(/insert\s+into\s+public\.\w+\s+values\s*\(/i);
  });

  it('installs owner-only, transaction-scoped retirement and restore functions', () => {
    expect(sql).toMatch(/create\s+(or\s+replace\s+)?function\s+private\.retire_remedi_duplicate/i);
    expect(sql).toMatch(/create\s+(or\s+replace\s+)?function\s+private\.restore_remedi_retirement/i);
    expect(sql).toMatch(/create\s+(or\s+replace\s+)?function\s+private\.remedi_retire_capture_row/i);
    expect(sql).toMatch(/security\s+definer/i);
    expect(sql).toMatch(/revoke\s+all\s+on\s+function\s+private\.retire_remedi_duplicate[\s\S]*from\s+public\s*,\s*anon\s*,\s*authenticated\s*,\s*service_role/i);
    expect(sql).toMatch(/revoke\s+all\s+on\s+function\s+private\.restore_remedi_retirement[\s\S]*from\s+public\s*,\s*anon\s*,\s*authenticated\s*,\s*service_role/i);
  });

  it('captures full row images before any delete and in FK-safe order', () => {
    expect(sql).toMatch(/to_jsonb\(_row\)/i);
    expect(sql).toMatch(/remedi_retired_rows[\s\S]*on\s+conflict[\s\S]*do\s+nothing/i);
    // capture happens before delete
    const captureIdx = sql.search(/remedi_retire_capture_row/);
    const deleteIdx = sql.search(/delete\s+from\s+public\.panel_claims/i);
    expect(captureIdx).toBeGreaterThan(-1);
    expect(deleteIdx).toBeGreaterThan(captureIdx);
  });

  it('is idempotent: retiring an already-retired key is a no-op', () => {
    expect(sql).toMatch(/reconciliation_status\s*=\s*'retired_duplicate_of_live'\s+then\s+return\s+0/i);
  });

  it('verifies the financial subcase against actual money before deleting', () => {
    expect(sql).toMatch(/remedi_retire_subcase_mismatch/i);
    expect(sql).toMatch(/_financial_subcase\s*=\s*'A_clinical_only'/i);
    expect(sql).toMatch(/_financial_subcase\s*=\s*'D_with_payments'/i);
    expect(sql).toMatch(/_financial_subcase\s*=\s*'E_with_claim'/i);
  });

  it('preserves the payment trigger contract while adding the restore branch', () => {
    expect(sql).toMatch(/pg_get_functiondef[\s\S]*private\.validate_payment_insert/i);
    expect(sql).toMatch(/REMEDI_RESTORE_OWNER_CONNECTION_REQUIRED/i);
    expect(sql).toMatch(/remedi_retirement_restore_mode/i);
    expect(sql).toMatch(/NEW\.created_by\s*:=\s*auth\.uid\(\)/i);
    expect(sql).toMatch(/PAYMENT_ACTOR_REQUIRED/i);
    expect(sql).toMatch(/STALE_PATIENT_OUTSTANDING/i);
    expect(sql).toMatch(/REMEDI_IMPORT_CONTEXT_INVALID/i);
    expect(sql).toMatch(/REMEDI_RETIRE_RESTORE_TRIGGER_PATCH_FAILED/i);
  });

  it('preflights reviewed boundaries and seeds no PHI', () => {
    expect(sql).toMatch(/REMEDI_RETIRE_PRECHECK_[A-Z_]+/i);
    expect(sql).toMatch(/PAYMENT_PROVENANCE_IMMUTABLE/i);
    expect(sql).not.toMatch(/insert\s+into\s+public\.\w+\s+values\s*\(/i);
  });

  it('records resolved duplicate-of-live conflicts with upsert semantics', () => {
    expect(sql).toMatch(/duplicate_of_live_visit[\s\S]*'warning'[\s\S]*'resolved'/i);
    expect(sql).toMatch(/on\s+conflict\s+\(batch_id,\s*source_key_hash\)\s+do\s+update/i);
  });
});
