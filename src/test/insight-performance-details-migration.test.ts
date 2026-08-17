import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const path = resolve(process.cwd(), 'supabase/migrations/20260817120000_complete_insight_performance_details.sql');

function migration() {
  expect(existsSync(path)).toBe(true);
  return readFileSync(path, 'utf8');
}

describe('complete Insight performance detail migration', () => {
  it('exposes one fail-closed effective viewer scope', () => {
    const sql = migration();
    expect(sql).toMatch(/function\s+public\.get_insight_viewer_scope\s*\(\s*\)/i);
    expect(sql).toMatch(/security\s+definer[\s\S]*set\s+search_path\s*=\s*pg_catalog\s*,\s*public/i);
    expect(sql).toMatch(/public\.can_view_insight_workspace\s*\(\s*\(\s*select\s+auth\.uid\s*\(\s*\)\s*\)\s*\)/i);
    expect(sql).toMatch(/'doctor_id'[\s\S]*resident_doctor/i);
    expect(sql).toMatch(/clinic_(?:role_permissions|user_permission_overrides)[\s\S]*'permission_version'/i);
    expect(sql).toMatch(/revoke\s+all\s+on\s+function\s+public\.get_insight_viewer_scope\s*\(\s*\)\s+from\s+public\s*,\s*anon/i);
  });

  it('uses the authoritative document charge item in doctor activity', () => {
    const sql = migration();
    expect(sql).toMatch(/function\s+public\.get_doctor_clinical_activity\s*\(\s*_start_date\s+date\s*,\s*_end_date\s+date\s*\)/i);
    expect(sql).toMatch(/public\.can_view_insight_workspace\s*\(\s*\(\s*select\s+auth\.uid\s*\(\s*\)\s*\)\s*\)/i);
    expect(sql).toMatch(/consultation_items\s+(?:as\s+)?document_item[\s\S]*document_item\.source_document_id\s*=\s*(?:cd|document)\.id/i);
    expect(sql).toMatch(/document_item\.price[\s\S]*document_item\.quantity[\s\S]*document_item\.price\s*\*\s*document_item\.quantity/i);
  });

  it('provides unique secured filter and lazy-detail RPCs with resident enforcement', () => {
    const sql = migration();
    expect(sql).toMatch(/function\s+public\.get_insight_performance_filtered\s*\(\s*_start_date\s+date\s*,\s*_end_date\s+date\s*,\s*_doctor_id\s+uuid\s*,\s*_payment_type\s+text\s*,\s*_activity_type\s+text\s*,\s*_include_comparison\s+boolean\s*\)/i);
    expect(sql).toMatch(/function\s+public\.get_insight_performance_detail\s*\(\s*_start_date\s+date\s*,\s*_end_date\s+date\s*,\s*_detail_kind\s+text\s*,\s*_detail_id\s+text\s*\)/i);
    expect(sql.match(/public\.can_view_insight_workspace/g)?.length).toBeGreaterThanOrEqual(4);
    expect(sql).toMatch(/resident_doctor[\s\S]*v_caller_doctor_id[\s\S]*_doctor_id/i);
    expect(sql).toMatch(/_payment_type[\s\S]*'self_pay'[\s\S]*'panel'/i);
    expect(sql).toMatch(/_activity_type[\s\S]*'consultation'[\s\S]*'procedure'[\s\S]*'document'/i);
    expect(sql).toMatch(/_detail_kind[\s\S]*'doctor'[\s\S]*'service'/i);
  });

  it('returns the approved doctor and service detail dimensions', () => {
    const sql = migration();
    for (const key of [
      'visits_by_shift', 'average_visit_duration_minutes', 'payment_mix',
      'financial', 'cogs', 'gross_profit', 'margin_pct', 'quality',
      'missing_consultation_notes', 'missing_diagnosis', 'missing_dispense_note',
      'returned_offline_consultations', 'incomplete_doctor_attribution',
      'bills_corrected_after_completion', 'diagnoses', 'medicines',
      'doctor_contribution', 'visits', 'current_catalog', 'margin_history',
    ]) expect(sql).toContain(`'${key}'`);
  });

  it('locks down every new RPC and keeps PostgREST signatures unambiguous', () => {
    const sql = migration();
    for (const signature of [
      'get_insight_viewer_scope()',
      'get_insight_performance_filtered(date, date, uuid, text, text, boolean)',
      'get_insight_performance_detail(date, date, text, text)',
    ]) {
      const escaped = signature.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/, /g, '\\s*,\\s*');
      expect(sql).toMatch(new RegExp(`revoke\\s+all\\s+on\\s+function\\s+public\\.${escaped}\\s+from\\s+public\\s*,\\s*anon`, 'i'));
      expect(sql).toMatch(new RegExp(`grant\\s+execute\\s+on\\s+function\\s+public\\.${escaped}\\s+to\\s+authenticated`, 'i'));
    }
  });
});
