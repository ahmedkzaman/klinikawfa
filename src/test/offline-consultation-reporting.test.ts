import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), 'utf8');
}

function exportedFunction(file: string, name: string) {
  const start = file.indexOf(`export function ${name}`);
  expect(start, `Expected ${name} to be exported`).toBeGreaterThanOrEqual(0);

  const next = file.indexOf('\nexport function ', start + 1);
  return file.slice(start, next === -1 ? undefined : next);
}

describe('offline consultation reporting attribution', () => {
  const patientHistory = source('src/hooks/patients/usePatientVisitHistory.ts');
  const queueEntries = source('src/hooks/clinic/useQueueEntries.ts');
  const consultations = source('src/hooks/clinic/useConsultations.ts');
  const doctorActivityMigration = source(
    'supabase/migrations/20260728113618_add_doctor_clinical_activity_report.sql',
  );
  const financialReportingMigration = source(
    'supabase/migrations/20260728153000_reconcile_completed_bill_financial_reporting.sql',
  );

  it('keeps patient visit history attributed through consultations.doctor_id', () => {
    const historyQuery = exportedFunction(patientHistory, 'usePatientVisitHistory');

    expect(historyQuery).toMatch(/consultations:consultations!consultations_queue_entry_id_fkey[\s\S]*doctors:doctor_id/i);
    expect(historyQuery).not.toMatch(/doctors:entered_by/i);
  });

  it('keeps Completed Today attributed through consultations.doctor_id', () => {
    const completedTodayQuery = exportedFunction(queueEntries, 'useCompletedTodayEntries');

    expect(completedTodayQuery).toMatch(/consultations:consultations!consultations_queue_entry_id_fkey[\s\S]*doctors:doctor_id/i);
    expect(completedTodayQuery).not.toMatch(/doctors:entered_by/i);
  });

  it('keeps consultation history attributed through consultations.doctor_id', () => {
    const consultationHistoryQuery = exportedFunction(consultations, 'usePatientConsultationHistory');

    expect(consultationHistoryQuery).toMatch(/doctors:doctor_id\s*\(/i);
    expect(consultationHistoryQuery).not.toMatch(/doctors:entered_by/i);
  });

  it('keeps doctor clinical activity attributed through consultations.doctor_id', () => {
    expect(doctorActivityMigration).toMatch(/c\.doctor_id/i);
    expect(doctorActivityMigration).not.toMatch(/entered_by/i);
  });

  it('does not exclude pending approval from Completed Today or financial reporting', () => {
    const completedTodayQuery = exportedFunction(queueEntries, 'useCompletedTodayEntries');

    expect(completedTodayQuery).not.toMatch(/approval_status/i);
    expect(financialReportingMigration).not.toMatch(/approval_status/i);
    expect(financialReportingMigration).toMatch(/c\.status\s*=\s*'completed'\s+or\s+qe\.clinic_status\s*=\s*'completed'/i);
  });
});
