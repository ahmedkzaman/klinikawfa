import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(
  'supabase/migrations/20260809091939_management_dashboard_reporting.sql',
  'utf8',
);
const doctorRosterHoursSql = readFileSync(
  'supabase/migrations/20260809141841_add_doctor_roster_hours_to_management_dashboard.sql',
  'utf8',
);

describe('management dashboard reporting contract', () => {
  it('uses the shared financial facts and Kuala Lumpur date boundaries', () => {
    expect(sql).toContain('private.financial_control_visit_facts');
    expect(sql).toContain("Asia/Kuala_Lumpur");
    expect(sql).toContain('called_at IS NOT NULL');
    expect(sql).toMatch(/q\.called_at\s*>=\s*q\.created_at/);
  });

  it('keeps internal appointment conversion and aggregate payroll private', () => {
    expect(sql).toContain('public.clinic_appointments');
    expect(sql).not.toMatch(/FROM public\.appointments\b/i);
    expect(sql).toContain('approved_overtime_hours');
    expect(sql).toContain('approvedOtHours');
    expect(sql).toContain('approvedOtPay');
    expect(sql).not.toContain("'staffId'");
    expect(sql).not.toContain("'employeeName'");
  });

  it('guards and narrows the public RPC grant', () => {
    expect(sql).toContain('can_view_management_dashboard');
    expect(sql).toMatch(/RAISE EXCEPTION 'NOT_AUTHORIZED'/i);
    expect(sql).toMatch(
      /REVOKE ALL ON FUNCTION public\.get_management_dashboard\(date\) FROM PUBLIC, anon/is,
    );
    expect(sql).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.get_management_dashboard\(date\) TO authenticated/is,
    );
  });

  it('returns independent operations, financial, stock, appointments and coverage sections', () => {
    for (const key of ['period', 'operations', 'financial', 'stock', 'appointments', 'coverage']) {
      expect(sql).toContain(`'${key}'`);
    }
    expect(sql).toContain("'Unassigned'");
    expect(sql).toContain("'manual'");
    expect(sql).toContain("'catalogue'");
  });

  it('returns doctor roster minimum hours from saved doctor roster shifts', () => {
    expect(doctorRosterHoursSql).toContain('doctor_roster_hours');
    expect(doctorRosterHoursSql).toContain('public.saved_rosters');
    expect(doctorRosterHoursSql).toContain("sr.roster_type = 'doctor'");
    expect(doctorRosterHoursSql).toContain("'doctorRosterHours'");
    expect(doctorRosterHoursSql).toContain("'totalHours'");
    expect(doctorRosterHoursSql).toContain("'doctorCount'");
    expect(doctorRosterHoursSql).toContain("'shiftCount'");
    expect(doctorRosterHoursSql).toMatch(/WHEN shift_key IN \('DOC_S1', 'shift1'\) THEN 5/i);
    expect(doctorRosterHoursSql).toMatch(/WHEN shift_key IN \('DOC_S2', 'shift2'\) THEN 5/i);
    expect(doctorRosterHoursSql).toMatch(/WHEN shift_key IN \('DOC_S3', 'shift3'\) THEN 4/i);
  });
});
