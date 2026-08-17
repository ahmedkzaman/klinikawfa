import { describe, expect, it } from 'vitest';
import { doctorAttributionField, doctorConcentrationLabel, getInsightAccess } from '@/lib/clinic/insight/insightAccess';

describe('Insight access policy', () => {
  it('gives special and doctor admins clinic-wide named doctor access', () => {
    expect(getInsightAccess('doctor_admin', null).canSeeNamedDoctors).toBe(true);
    expect(getInsightAccess('special_admin', null).canSeeNamedDoctors).toBe(true);
  });

  it('limits resident doctors to their own named detail and anonymized benchmarks', () => {
    expect(getInsightAccess('resident_doctor', 'doctor-7')).toMatchObject({
      canOpenInsight: true,
      canSeeNamedDoctors: false,
      canSeeClinicDoctorBenchmarks: true,
      canSeeServicePerformance: false,
      ownDoctorId: 'doctor-7',
    });
  });

  it('allows operations roles to view service performance without named doctor comparisons', () => {
    expect(getInsightAccess('ops_staff', null)).toMatchObject({
      canOpenInsight: true,
      canSeeNamedDoctors: false,
      canSeeServicePerformance: true,
    });
    expect(getInsightAccess('operations', null).canSeeServicePerformance).toBe(true);
  });

  it.each(['locum', 'guest', null] as const)(
    'denies Insight to %s even when a doctor identity is present',
    (role) => {
      expect(getInsightAccess(role, 'doctor-8').canOpenInsight).toBe(false);
    },
  );

  it('redacts doctor identity from finance concentration comparisons when names are disallowed', () => {
    expect(doctorConcentrationLabel('Dr Sensitive', 61.2, false)).toBe('Largest doctor share: 61% of revenue');
    expect(doctorConcentrationLabel('Dr Sensitive', 61.2, false)).not.toContain('Sensitive');
    expect(doctorConcentrationLabel('Dr Sensitive', 61.2, true)).toBe('Dr Sensitive: 61% of revenue');
    expect(doctorAttributionField(false)).toBe('doctor_id');
    expect(doctorAttributionField(true)).toBe('doctor_name');
  });
});
