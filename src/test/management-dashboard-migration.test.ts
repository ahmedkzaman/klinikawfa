import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  'supabase/migrations/20260809091634_management_dashboard_foundation.sql',
  'utf8',
);

describe('management dashboard foundation migration', () => {
  it('defines month-key uniqueness, RLS and append-only audit storage', () => {
    expect(migration).toContain('UNIQUE (month_start, metric_key)');
    expect(migration).toContain('management_dashboard_metric_audit');
    expect(migration).toContain('ENABLE ROW LEVEL SECURITY');
    expect(migration).toMatch(
      /REVOKE (?:UPDATE|DELETE|ALL)[\s\S]*management_dashboard_metric_audit/is,
    );
  });

  it('encodes the exact viewer and editor role sets', () => {
    const viewerRoles = [
      'admin',
      'special_admin',
      'doctor_admin',
      'resident_doctor',
      'staff',
      'ops_staff',
      'operations',
      'purchaser',
      'staff_nurse',
    ];
    viewerRoles.forEach((role) => expect(migration).toContain(`'${role}'`));

    const editorFunction = migration.match(
      /CREATE OR REPLACE FUNCTION public\.can_edit_management_dashboard[\s\S]*?\$function\$;/i,
    )?.[0];
    expect(editorFunction).toBeDefined();
    expect(editorFunction).toContain("'admin'");
    expect(editorFunction).toContain("'special_admin'");
    expect(editorFunction).toContain("'doctor_admin'");
    expect(editorFunction).not.toContain("'locum'");
  });

  it('guards mutations and records internal appointment attendance only', () => {
    expect(migration).toContain('set_management_dashboard_metric');
    expect(migration).toMatch(
      /REVOKE ALL ON FUNCTION public\.set_management_dashboard_metric[\s\S]*FROM PUBLIC, anon/is,
    );
    expect(migration).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.set_management_dashboard_metric[\s\S]*TO authenticated/is,
    );
    expect(migration).toContain('ALTER TABLE public.clinic_appointments');
    expect(migration).toContain('queue_entry_id uuid');
    expect(migration).toContain('checked_in_at timestamptz');
    expect(migration).toContain('link_clinic_appointment_checkin');
    expect(migration).not.toMatch(
      /ALTER TABLE public\.appointments[\s\S]*queue_entry_id/i,
    );
  });
});

describe('management dashboard access restriction migration', () => {
  const sql = readFileSync(
    'supabase/migrations/20260809103031_restrict_management_dashboard_operations_access.sql',
    'utf8',
  );

  it('excludes locum and both operations role names from dashboard access', () => {
    expect(sql).not.toMatch(/'(ops_staff|operations|locum)'/);
    expect(sql).toMatch(/'admin'[\s\S]*'special_admin'[\s\S]*'doctor_admin'/);
    expect(sql).toMatch(/'resident_doctor'[\s\S]*'staff'[\s\S]*'purchaser'[\s\S]*'staff_nurse'/);
  });
});
