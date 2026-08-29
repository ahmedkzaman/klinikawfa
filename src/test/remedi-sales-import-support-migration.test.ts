import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';


const migrationsDir = resolve(process.cwd(), 'supabase/migrations');
const migrationName = readdirSync(migrationsDir).find((name) =>
  /^\d{14}_add_remedi_sales_import_support\.sql$/.test(name),
);
if (!migrationName) {
  throw new Error('CLI-generated add_remedi_sales_import_support migration is missing');
}
const sql = readFileSync(resolve(migrationsDir, migrationName), 'utf8');
const historyHook = readFileSync(
  resolve(process.cwd(), 'src/hooks/patients/usePatientVisitHistory.ts'),
  'utf8',
);
const attendanceFixture = readFileSync(
  resolve(process.cwd(), 'supabase/tests/attendance_heatmap.sql'),
  'utf8',
);
const privateTables = [
  'remedi_import_batches',
  'remedi_source_files',
  'remedi_patient_map',
  'remedi_encounter_map',
  'remedi_invoice_map',
  'remedi_import_conflicts',
];


describe('Remedi import support migration', () => {
  it('uses a CLI timestamp after the migrations already on main', () => {
    expect(migrationName.slice(0, 14) > '20260828120000').toBe(true);
  });

  it('keeps every import ledger private, force-RLS protected, and ungranted', () => {
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

  it('defines idempotency, foreign-key indexes, status checks, and exact money checks', () => {
    expect(sql).toMatch(/unique\s*\(\s*batch_id\s*,\s*bill_number\s*\)/i);
    expect(sql).toMatch(/unique\s*\(\s*batch_id\s*,\s*encounter_hash\s*\)/i);
    expect(sql).toMatch(/unique\s*\(\s*batch_id\s*,\s*source_key_hash\s*\)/i);
    expect(sql).toMatch(/check\s*\(\s*status\s+in\s*\(/i);
    expect(sql).toMatch(/check\s*\(\s*reconciliation_status\s+in\s*\(/i);
    expect(sql).toMatch(/gross_amount\s*>?=\s*0/i);
    expect(sql).toMatch(/round\s*\(\s*gross_amount\s*,\s*2\s*\)\s*=\s*gross_amount/i);
    expect(sql).toMatch(/create\s+index[\s\S]{0,120}remedi_patient_map[\s\S]{0,80}\(\s*patient_id\s*\)/i);
    expect(sql).toMatch(/create\s+index[\s\S]{0,120}remedi_invoice_map[\s\S]{0,80}\(\s*patient_id\s*\)/i);
    expect(sql).toMatch(
      /panel_claim_id\s+uuid\s+references\s+public\.panel_claims\(id\)\s+on\s+delete\s+restrict\s+deferrable\s+initially\s+deferred/i,
    );
  });

  it('extends only the queue visit-type boundary and preserves consultation provenance', () => {
    expect(sql).toMatch(
      /queue_entries_visit_type_check[\s\S]*visit_type\s+in\s*\([\s\S]*'consultation'[\s\S]*'direct_sale'[\s\S]*'payment_only'[\s\S]*'historical_import'/i,
    );
    expect(sql).not.toMatch(/alter\s+table\s+public\.consultations/i);
    expect(sql).not.toMatch(/entry_source\s+in/i);
    expect(sql).not.toMatch(/offline_transcription/i);
  });

  it('adds historical arrivals to both attendance implementations without inventing waits', () => {
    expect(sql).toMatch(/get_clinical_attendance_heatmap\(date,date,uuid\)/i);
    expect(sql).toMatch(/_get_insight_clinical_attendance_heatmap_round3\(date,date,uuid\)/i);
    expect(sql).toMatch(/queue_number\s+is\s+not\s+null\s+or\s+qe\.visit_type::text\s*=\s*''historical_import''/i);
    expect(sql).toMatch(/qe\.visit_type::text\s*<>\s*''payment_only''/i);
    expect(sql).toMatch(/called_at\s*>?=\s*qe\.created_at/i);
    expect(sql).toContain('waiting time NULL');
    expect(sql).toMatch(/remedi_historical_attendance_created_idx[\s\S]*created_at/i);
  });

  it('proves a null-queue historical visit is counted while payment-only stays excluded', () => {
    expect(attendanceFixture).toMatch(
      /000000000211[^\n]+NULL\s*,\s*'historical_import'/i,
    );
    expect(attendanceFixture).toMatch(
      /000000000207[^\n]+'payment_only'/i,
    );
    expect(attendanceFixture).toMatch(
      /totalVisits'\)::integer\s+IS\s+DISTINCT\s+FROM\s+6[\s\S]{0,120}rawTotalVisits'\)::integer\s+IS\s+DISTINCT\s+FROM\s+6/i,
    );
    expect(attendanceFixture).toContain('HISTORICAL_IMPORT_OR_PAYMENT_EXCLUSION_MISMATCH');
  });

  it('keeps payment-only rows out of patient history while retaining historical imports', () => {
    expect(historyHook).toMatch(/\.neq\(\s*'visit_type'\s*,\s*'payment_only'\s*\)/i);
    expect(historyHook).not.toMatch(/neq\(\s*'visit_type'\s*,\s*'historical_import'/i);
  });

  it('installs a PostgreSQL-owner-only, transaction-scoped historical payment path', () => {
    expect(sql).toMatch(/create\s+function\s+private\.begin_remedi_import_context/i);
    expect(sql).toMatch(/create\s+function\s+private\.import_remedi_payment/i);
    expect(sql).toMatch(/create\s+function\s+private\.import_remedi_panel_claim/i);
    expect(sql).toMatch(/session_user\s*<>\s*'postgres'/i);
    expect(sql).toMatch(/txid_current\(\)/i);
    expect(sql).toMatch(/set_config\([^;]*true\)/i);
    expect(sql).toMatch(/allowed_methods[\s\S]*cash[\s\S]*transfer[\s\S]*card[\s\S]*qr_pay/i);
    expect(sql).toMatch(/source_created_at/i);
    expect(sql).toMatch(/actor_id[\s\S]*public\.profiles/i);
    expect(sql).toMatch(/queue_entry_id[\s\S]*consultation_id[\s\S]*patient_id/i);
    expect(sql).toMatch(/revoke\s+all\s+on\s+function\s+private\.import_remedi_payment[\s\S]*from\s+public\s*,\s*anon\s*,\s*authenticated\s*,\s*service_role/i);
    expect(sql).toMatch(/revoke\s+all\s+on\s+function\s+private\.import_remedi_panel_claim[\s\S]*from\s+public\s*,\s*anon\s*,\s*authenticated\s*,\s*service_role/i);
  });

  it('creates one fixed inactive provider for source-unspecified corporate claims', () => {
    expect(sql).toMatch(
      /insert\s+into\s+public\.insurance_providers[\s\S]*72656d65-6469-4000-8000-000000000001[\s\S]*Legacy Remedi Corporate - Provider Unspecified[\s\S]*inactive/i,
    );
    expect(sql).toMatch(/REMEDI_LEGACY_PROVIDER_CONFLICT/i);
  });

  it('preserves the ordinary payment trigger contract outside the owner context', () => {
    expect(sql).toMatch(/pg_get_functiondef\([\s\S]*private\.validate_payment_insert/i);
    expect(sql).toMatch(/new\.created_by\s*:=\s*auth\.uid\(\)/i);
    expect(sql).toMatch(/new\.created_at\s*:=\s*pg_catalog\.statement_timestamp\(\)/i);
    expect(sql).toMatch(/PAYMENT_ACTOR_REQUIRED/i);
    expect(sql).toMatch(/STALE_PATIENT_OUTSTANDING/i);
    expect(sql).toMatch(/remedi_import_context[\s\S]*return\s+new/i);
  });

  it('preflights reviewed triggers, constraints, policies, functions, and indexes and seeds no PHI', () => {
    for (const catalog of ['pg_trigger', 'pg_constraint', 'pg_policy', 'pg_indexes']) {
      expect(sql).toContain(catalog);
    }
    expect(sql).toMatch(/pg_get_functiondef/i);
    expect(sql).toMatch(/RAISE\s+EXCEPTION\s+'REM?EDI_PRECHECK/i);
    expect(sql).not.toMatch(/insert\s+into\s+public\.patients/i);
    expect(sql).not.toMatch(/insert\s+into\s+public\.queue_entries/i);
    expect(sql).not.toMatch(/insert\s+into\s+public\.consultations/i);
  });

  it('does not use PostgreSQL reserved words as catalog aliases', () => {
    expect(sql).not.toMatch(/\bas\s+constraint\b/i);
  });
});
