import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(resolve(
  process.cwd(),
  'supabase/migrations/20260817140000_harden_insight_refresh_and_filtered_semantics.sql',
), 'utf8');

describe('Insight round-three migration contract', () => {
  it('versions and publishes the effective role while closing the UUID permission oracle', () => {
    expect(sql).toMatch(/role_row\.role::text[\s\S]*role_row\.created_at/i);
    expect(sql).toMatch(/'role'\s*,\s*v_role/i);
    expect(sql).toMatch(/permission_version[\s\S]*v_role[\s\S]*clinic_role_permissions[\s\S]*clinic_user_permission_overrides/i);
    expect(sql).toMatch(/revoke all on function public\.can_view_insight_workspace\(uuid\) from public, anon, authenticated/i);
  });

  it('uses linked item type precedence and one payment classifier throughout reports', () => {
    expect(sql).toMatch(/when _item_id is not null then exists[\s\S]*inventory\.id = _item_id/i);
    expect(sql).toMatch(/else exists[\s\S]*legacy_service/i);
    expect(sql).toMatch(/payment\.payment_type[\s\S]*payment\.payment_method/i);
    expect(sql.match(/public\._insight_payment_classification\(/gi)?.length).toBeGreaterThanOrEqual(8);
    expect(sql.match(/public\._insight_is_procedure_item\(/gi)?.length).toBeGreaterThanOrEqual(10);
  });

  it('derives roster hours and filtered quality from authoritative source rows', () => {
    expect(sql).toMatch(/function public\._insight_rostered_hours[\s\S]*jsonb_each\(roster\.roster_data\)/i);
    expect(sql).toMatch(/issued_documents as materialized[\s\S]*document\.created_at[\s\S]*missing_attribution/i);
    expect(sql).toMatch(/'quality'\s*,\s*v_quality[\s\S]*'confidence'\s*,\s*v_confidence/i);
  });

  it('keeps management and Insight attendance in separate permission domains', () => {
    expect(sql).toMatch(/function public\.get_insight_clinical_attendance_heatmap[\s\S]*can_view_insight_workspace\(\)/i);
    expect(sql).not.toMatch(/function public\.get_insight_clinical_attendance_heatmap[\s\S]{0,500}return public\.get_clinical_attendance_heatmap/i);
    expect(sql).toMatch(/grant execute on function public\.get_clinical_attendance_heatmap\(date, date, uuid\) to authenticated/i);
  });
});
