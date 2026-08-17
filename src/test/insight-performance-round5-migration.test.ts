import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(resolve(
  process.cwd(),
  'supabase/migrations/20260817160000_complete_insight_document_rows_and_attendance_roster.sql',
), 'utf8');

describe('Insight round-five migration contract', () => {
  it('materializes document-only doctors with zero visit metrics in each permitted scope', () => {
    expect(sql).toMatch(/missing_named_rows as[\s\S]*'completed_visits', 0[\s\S]*'unique_patients', 0/i);
    expect(sql).toMatch(/resident_own_row as[\s\S]*document_stats[\s\S]*'completed_visits', 0/i);
    expect(sql).toMatch(/'doctor_name', 'Clinic benchmark'[\s\S]*'documents', attribution\.documents/i);
    expect(sql).toMatch(/when v_role in \('ops_staff', 'operations'\) then '\[\]'::jsonb/i);
  });

  it('excludes payment-only visits from aggregate and detail issued-document cohorts', () => {
    expect(sql.match(/queue_entry\.visit_type <> 'payment_only'/gi)?.length)
      .toBeGreaterThanOrEqual(3);
    expect(sql).toMatch(/issued_documents as materialized[\s\S]*document\.created_at[\s\S]*queue_entry\.visit_type <> 'payment_only'/i);
    expect(sql).toMatch(/_detail_kind = 'doctor'[\s\S]*document\.created_at[\s\S]*queue_entry\.visit_type <> 'payment_only'/i);
  });

  it('accepts roster identities only when UUID-shaped and mapped to an active doctor', () => {
    expect(sql).toMatch(/join public\.doctors as mapped_roster_doctor/i);
    expect(sql).toMatch(/mapped_roster_doctor\.id::text = nullif\(btrim\(assignment\.value->>''staffId''\)/i);
    expect(sql).toMatch(/mapped_roster_doctor\.status = ''active''/i);
    expect(sql).toMatch(/\[0-9a-f\]\{8\}[\s\S]*\[0-9a-f\]\{12\}/i);
    expect(sql).toMatch(/_get_insight_clinical_attendance_heatmap_round3[\s\S]*from public, anon, authenticated/i);
  });
});
