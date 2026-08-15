import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationPath = resolve(
  process.cwd(),
  'supabase/migrations/20260815143000_add_clinical_attendance_heatmap.sql',
);

function migrationSql(): string {
  return existsSync(migrationPath) ? readFileSync(migrationPath, 'utf8') : '';
}

describe('clinical attendance heatmap migration', () => {
  it('creates the protected aggregate-only RPC with the required signature', () => {
    const sql = migrationSql();

    expect(existsSync(migrationPath)).toBe(true);
    expect(sql).toMatch(
      /create\s+or\s+replace\s+function\s+public\.get_clinical_attendance_heatmap\s*\(\s*_start_date\s+date\s*,\s*_end_date\s+date\s*,\s*_doctor_id\s+uuid\s+default\s+null\s*\)\s*returns\s+jsonb/is,
    );
    expect(sql).toMatch(/security\s+definer/i);
    expect(sql).toMatch(/set\s+search_path\s*=\s*pg_catalog\s*,\s*public\s*,\s*pg_temp/i);
    expect(sql).toMatch(/not\s+public\.can_view_management_dashboard\s*\(\s*\(?select\s+auth\.uid\(\)\)?\s*\)/i);
    expect(sql).toMatch(/raise\s+exception\s+'NOT_AUTHORIZED'.*42501/is);
  });

  it('enforces inclusive date bounds and emits selected and equal-length comparison boundaries', () => {
    const sql = migrationSql();

    expect(sql).toMatch(/_start_date\s*>\s*_end_date/i);
    expect(sql).toMatch(/raise\s+exception\s+'INVALID_DATE_RANGE'.*22023/is);
    expect(sql).toMatch(/\(_end_date\s*-\s*_start_date\)\s*>\s*365/i);
    expect(sql).toMatch(/v_comparison_start\s+date\s*:=\s*_start_date\s*-\s*v_range_days/i);
    expect(sql).toMatch(/v_comparison_end\s+date\s*:=\s*_start_date\s*-\s*1/i);
    expect(sql).toMatch(/'startDate'\s*,\s*_start_date/i);
    expect(sql).toMatch(/'endDate'\s*,\s*_end_date/i);
    expect(sql).toMatch(/'comparisonStartDate'\s*,\s*v_comparison_start/i);
    expect(sql).toMatch(/'comparisonEndDate'\s*,\s*v_comparison_end/i);
  });

  it('assigns native qualifying visits by Malaysia local date, weekday, and hour', () => {
    const sql = migrationSql();

    expect(sql).toMatch(/queue_number\s+is\s+not\s+null/i);
    expect(sql).toMatch(/created_at\s+is\s+not\s+null/i);
    expect(sql).toMatch(/qe\.deleted_at\s+is\s+null/i);
    expect(sql).toMatch(/qe\.cancelled_at\s+is\s+null/i);
    expect(sql).toMatch(/qe\.clinic_status::text\s*<>\s*'cancelled'/i);
    expect(sql).toMatch(/qe\.visit_type::text\s*<>\s*'payment_only'/i);
    expect(sql).toMatch(/qualifying_consultations/i);
    expect(sql).toMatch(/join\s+qualifying_consultations\s+as\s+c\s+on\s+c\.queue_entry_id\s*=\s+qe\.id/i);
    expect(sql).toMatch(/c\.deleted_at\s+is\s+null/i);
    expect(sql).toMatch(/timezone\s*\(\s*'Asia\/Kuala_Lumpur'\s*,\s*qe\.created_at\s*\)/i);
    expect(sql).toMatch(/extract\s*\(\s*isodow\s+from\s+local_time\.local_created_at\s*\)/i);
    expect(sql).toMatch(/extract\s*\(\s*hour\s+from\s+local_time\.local_created_at\s*\)/i);
    expect(sql).toMatch(/extract\s*\(\s*hour\s+from\s+local_time\.local_created_at\s*\)\s+between\s+8\s+and\s+23/i);
    expect(sql).toMatch(/qe\.called_at\s*>=\s*qe\.created_at/i);
    expect(sql).toMatch(/current\s+imported\/synthetic-arrival\s+boundary/i);
  });

  it('uses saved doctor-roster keys for all-doctor and selected-doctor denominators', () => {
    const sql = migrationSql();

    for (const key of ['DOC_S1', 'shift1', 'DOC_S2', 'shift2', 'DOC_S3', 'shift3']) {
      expect(sql).toContain(`'${key}'`);
    }
    expect(sql).toMatch(/when\s+shift_entry\.key\s+in\s*\(\s*'DOC_S1'\s*,\s*'shift1'\s*\)\s+then\s+8/i);
    expect(sql).toMatch(/when\s+shift_entry\.key\s+in\s*\(\s*'DOC_S2'\s*,\s*'shift2'\s*\)\s+then\s+14/i);
    expect(sql).toMatch(/when\s+shift_entry\.key\s+in\s*\(\s*'DOC_S3'\s*,\s*'shift3'\s*\)\s+then\s+20/i);
    expect(sql).toMatch(/selected_doctor/i);
    expect(sql).toMatch(/other_doctor_covered_occurrences/i);
    expect(sql).toMatch(/'coverage'/i);
    expect(sql).toMatch(/'warnings'/i);
  });

  it('exposes only aggregate JSON and the intended execution grants', () => {
    const sql = migrationSql();

    for (const forbiddenField of ['patient_id', 'queue_entry_id', 'patient_name', 'national_id', 'passport', 'case_note', 'visit_notes']) {
      expect(sql).not.toMatch(new RegExp(`jsonb_build_object[\\s\\S]{0,1200}'${forbiddenField}'`, 'i'));
    }
    expect(sql).toMatch(/revoke\s+all\s+on\s+function\s+public\.get_clinical_attendance_heatmap\s*\(\s*date\s*,\s*date\s*,\s*uuid\s*\)\s+from\s+public\s*,\s*anon/i);
    expect(sql).toMatch(/grant\s+execute\s+on\s+function\s+public\.get_clinical_attendance_heatmap\s*\(\s*date\s*,\s*date\s*,\s*uuid\s*\)\s+to\s+authenticated/i);
    expect(sql).toMatch(/create\s+index\s+if\s+not\s+exists\s+clinical_attendance_heatmap_queue_created_idx\s+on\s+public\.queue_entries\s*\(\s*created_at\s*\)/i);
    expect(sql).toMatch(/create\s+index\s+if\s+not\s+exists\s+clinical_attendance_heatmap_consultation_queue_doctor_idx\s+on\s+public\.consultations\s*\(\s*queue_entry_id\s*,\s*doctor_id\s*\)/i);
  });
});
