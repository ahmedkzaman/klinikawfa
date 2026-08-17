import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(resolve(process.cwd(), 'supabase/migrations/20260817130000_complete_insight_workspace_security_filters.sql'), 'utf8');

describe('Insight workspace round-two migration', () => {
  it('defines one auth-bound reports.view authority and secured Insight wrappers', () => {
    expect(sql).toMatch(/function\s+public\.can_view_insight_workspace\s*\(\s*\)/i);
    expect(sql).toMatch(/auth\.uid\s*\(\s*\)[\s\S]*has_clinic_permission\s*\(\s*'reports\.view'/i);
    for (const name of ['get_insight_clinic_health_metrics', 'get_insight_financial_control_summary', 'get_insight_financial_control_details', 'get_insight_clinical_attendance_heatmap']) {
      expect(sql).toMatch(new RegExp(`function\\s+public\\.${name}[\\s\\S]*can_view_insight_workspace\\s*\\(\\s*\\)`, 'i'));
    }
    for (const legacy of ['get_clinic_health_metrics', 'get_financial_control_summary', 'get_financial_control_details', 'get_clinical_attendance_heatmap']) {
      expect(sql).toMatch(new RegExp(`revoke\\s+all\\s+on\\s+function\\s+public\\.${legacy}`, 'i'));
    }
  });

  it('uses one procedure classifier and filter-aware detail contract', () => {
    expect(sql).toMatch(/function\s+public\._insight_is_procedure_item/i);
    expect(sql.match(/public\._insight_is_procedure_item/g)?.length).toBeGreaterThan(3);
    expect(sql).toMatch(/function\s+public\.get_insight_performance_detail_filtered\s*\([\s\S]*_doctor_id\s+uuid[\s\S]*_payment_type\s+text[\s\S]*_activity_type\s+text/i);
    expect(sql).toMatch(/legacy_service\.id[\s\S]*service_key/i);
    expect(sql).toMatch(/least\s*\(\s*coalesce\s*\(\s*item\.dispensed_qty/i);
    expect(sql).toMatch(/missing_cost[\s\S]*'cogs'[\s\S]*case\s+when/i);
  });
});
