import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(resolve(
  process.cwd(),
  'supabase/migrations/20260817150000_enforce_insight_doctor_visibility_and_cohorts.sql',
), 'utf8');

describe('Insight round-four migration contract', () => {
  it('applies the same doctor-filter ceiling before aggregate, detail, and attendance execution', () => {
    expect(sql).toMatch(/v_role = 'resident_doctor'[\s\S]*_doctor_id[^;]+v_resident_doctor[\s\S]*not_authorized/i);
    expect(sql.match(/_doctor_id is not null and v_role not in \('special_admin', 'doctor_admin'\)/gi)?.length)
      .toBeGreaterThanOrEqual(3);
    expect(sql).toMatch(/_get_insight_performance_filtered_round3[\s\S]*from public, anon, authenticated/i);
    expect(sql).toMatch(/_get_insight_clinical_attendance_heatmap_round3[\s\S]*from public, anon, authenticated/i);
  });

  it('redacts attendance doctor directories according to authoritative scope', () => {
    expect(sql).toMatch(/when v_role in \('special_admin', 'doctor_admin'\) then v_result->'doctors'/i);
    expect(sql).toMatch(/when v_role = 'resident_doctor'[\s\S]*doctor_row->>'id' = v_resident_doctor::text/i);
    expect(sql).toMatch(/else '\[\]'::jsonb end/i);
  });

  it('uses issue-date document and deduplicated attribution cohorts', () => {
    expect(sql).toMatch(/issued_documents as materialized[\s\S]*document\.created_at[\s\S]*between _start_date and _end_date/i);
    expect(sql).toMatch(/count\(distinct id\)[\s\S]*selected_consultations where doctor_id is null/i);
    expect(sql).toMatch(/selected_documents where doctor_id is null/i);
    expect(sql).toMatch(/jsonb_build_object\('documents', v_documents\)/i);
  });

  it('classifies collection markers and validates roster identities without false totals', () => {
    expect(sql).toMatch(/coalesce\(payment\.payment_type, ''\)[\s\S]*<> 'panel'/i);
    expect(sql).toMatch(/coalesce\(payment\.payment_method, ''\)[\s\S]*<> 'panel'/i);
    expect(sql).toMatch(/select distinct day\.key::date[\s\S]*shift\.key[\s\S]*doctor_id/i);
    expect(sql).toMatch(/join public\.doctors as mapped_doctor/i);
  });
});
