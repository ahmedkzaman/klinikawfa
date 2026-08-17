import { describe, expect, it } from 'vitest';
import { normalizeInsightPerformanceDetail } from '@/lib/clinic/insight/performanceDetails';

describe('normalizeInsightPerformanceDetail', () => {
  it('normalizes doctor workload, financial, and doctor-specific quality', () => {
    expect(normalizeInsightPerformanceDetail({
      kind: 'doctor', doctor_id: 'doctor-1',
      visits_by_shift: [{ date: '2026-08-17', shift: 'S1', visits: 2 }],
      average_visit_duration_minutes: '12.5', duration_measured_visits: 2,
      payment_mix: [{ payment_type: 'self_pay', visits: 2 }],
      financial: { revenue: 100, cogs: 20, gross_profit: 80, margin_pct: 80, revenue_per_visit: 50, revenue_per_hour: 20, missing_cost_count: 0 },
      quality: { missing_consultation_notes: 1, missing_diagnosis: 0, missing_dispense_note: 0, returned_offline_consultations: 0, incomplete_doctor_attribution: 0, bills_corrected_after_completion: 1 },
      diagnoses: [{ name: 'URTI', visits: 2 }], procedures: [{ name: 'Dressing', quantity: 2, charged: 100, cogs: null, gross_profit: null }], medicines: [{ name: 'Paracetamol', quantity: 4 }],
    })).toMatchObject({ kind: 'doctor', averageVisitDurationMinutes: 12.5, financial: { grossProfit: 80 }, quality: { missingConsultationNotes: 1 } });
  });

  it.each([null, {}, { kind: 'doctor', doctor_id: 'x' }, { kind: 'service', service_id: 's', visits: [{ quantity: '=bad' }] }])(
    'rejects malformed detail instead of rendering or exporting it: %#',
    (payload) => expect(() => normalizeInsightPerformanceDetail(payload)).toThrow(/performance detail/i),
  );

  it.each([
    { field: 'shift', value: 'S4' },
    { field: 'date', value: '17/08/2026' },
    { field: 'date', value: '2026-02-30' },
    { field: 'payment_type', value: 'insurance' },
  ])('rejects malformed $field enums instead of coercing them', ({ field, value }) => {
    const payload = {
      kind: 'doctor', doctor_id: 'doctor-1',
      visits_by_shift: [{ date: field === 'date' ? value : '2026-08-17', shift: field === 'shift' ? value : 'S1', visits: 1 }],
      average_visit_duration_minutes: null, duration_measured_visits: 0,
      payment_mix: [{ payment_type: field === 'payment_type' ? value : 'panel', visits: 1 }],
      financial: { revenue: 0, cogs: null, gross_profit: null, margin_pct: null, revenue_per_visit: null, revenue_per_hour: null, missing_cost_count: 1 },
      quality: { missing_consultation_notes: 0, missing_diagnosis: 0, missing_dispense_note: 0, returned_offline_consultations: 0, incomplete_doctor_attribution: 0, bills_corrected_after_completion: 0 },
      diagnoses: [], procedures: [], medicines: [],
    };
    expect(() => normalizeInsightPerformanceDetail(payload)).toThrow(/performance detail/i);
  });
});
