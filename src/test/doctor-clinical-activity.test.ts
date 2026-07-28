import { describe, expect, it } from 'vitest';
import {
  aggregateDoctorClinicalActivity,
  doctorClinicalActivityCsv,
  type DoctorActivityRow,
} from '@/lib/clinic/doctorClinicalActivity';

const row = (overrides: Partial<DoctorActivityRow> = {}): DoctorActivityRow => ({
  activityId: 'activity-1',
  activityKind: 'procedure',
  activityDate: '2026-07-28T09:00:00.000Z',
  activityName: 'Nebulisation',
  consultationId: 'consultation-1',
  queueEntryId: 'queue-entry-1',
  queueCreatedAt: '2026-07-28T08:00:00.000Z',
  queueSequence: 1,
  doctorId: 'doctor-1',
  doctorName: 'Dr A',
  patientName: 'Patient One',
  ...overrides,
});

describe('aggregateDoctorClinicalActivity', () => {
  it('groups procedure and document activity by treating doctor', () => {
    const result = aggregateDoctorClinicalActivity([
      row({ activityId: 'p1', activityKind: 'procedure', doctorId: 'd1', doctorName: 'Dr A' }),
      row({ activityId: 'm1', activityKind: 'mc', doctorId: 'd1', doctorName: 'Dr A' }),
      row({ activityId: 'q1', activityKind: 'quarantine', doctorId: 'd1', doctorName: 'Dr A' }),
      row({ activityId: 'r1', activityKind: 'referral', doctorId: 'd1', doctorName: 'Dr A' }),
    ]);

    expect(result[0]).toMatchObject({
      doctorId: 'd1',
      procedures: 1,
      mc: 1,
      quarantine: 1,
      referral: 1,
      totalDocuments: 3,
    });
    expect(result[0].rows).toHaveLength(4);
  });

  it('preserves unassigned activity and sorts it after named doctors', () => {
    const result = aggregateDoctorClinicalActivity([
      row({ activityId: 'u1', doctorId: null, doctorName: 'Unassigned' }),
      row({ activityId: 'd1', doctorId: 'doctor-1', doctorName: 'Dr A' }),
    ]);

    expect(result.map((item) => item.doctorName)).toEqual(['Dr A', 'Unassigned']);
  });

  it('sorts each doctor activity list from newest to oldest', () => {
    const result = aggregateDoctorClinicalActivity([
      row({ activityId: 'old', activityDate: '2026-07-27T09:00:00.000Z' }),
      row({ activityId: 'new', activityDate: '2026-07-28T09:00:00.000Z' }),
    ]);

    expect(result[0].rows.map((item) => item.activityId)).toEqual(['new', 'old']);
  });
});

describe('doctorClinicalActivityCsv', () => {
  it('exports only the selected doctor when a doctor filter is supplied', () => {
    const csv = doctorClinicalActivityCsv(
      aggregateDoctorClinicalActivity([
        row({ activityId: 'a1', doctorId: 'd1', doctorName: 'Dr A', patientName: 'Patient One' }),
        row({ activityId: 'b1', doctorId: 'd2', doctorName: 'Dr B', patientName: 'Patient Two' }),
      ]),
      'd1',
    );

    expect(csv).toContain('Dr A');
    expect(csv).toContain('Patient One');
    expect(csv).not.toContain('Dr B');
    expect(csv).not.toContain('Patient Two');
  });

  it('uses the documented header and CSV-safe CRLF rows', () => {
    const csv = doctorClinicalActivityCsv(aggregateDoctorClinicalActivity([
      row({ doctorName: 'Dr "A"', activityName: 'Review, follow-up' }),
    ]));

    expect(csv).toBe(
      'Doctor,Date,Activity Type,Activity Name,Patient,Queue Number\r\n' +
      '"Dr ""A""","2026-07-28T09:00:00.000Z","procedure","Review, follow-up","Patient One","1"',
    );
  });

  it('uses null as an explicit filter for unassigned activity', () => {
    const csv = doctorClinicalActivityCsv(aggregateDoctorClinicalActivity([
      row({ activityId: 'assigned', doctorId: 'd1', doctorName: 'Dr A', patientName: 'Assigned Patient' }),
      row({ activityId: 'unassigned', doctorId: null, doctorName: 'Unassigned', patientName: 'Unassigned Patient' }),
    ]), null);

    expect(csv).toContain('Unassigned Patient');
    expect(csv).not.toContain('Assigned Patient');
  });
});
