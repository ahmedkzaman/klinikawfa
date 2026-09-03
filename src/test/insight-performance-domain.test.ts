import { describe, expect, it } from 'vitest';
import { normalizeInsightPerformanceReport } from '@/lib/clinic/insight/performance';

const validPayload = {
  clinic: {
    completed_visits: '2',
    unique_patients: 2,
    rostered_hours: '10.00',
    patients_per_hour: '0.20',
    visit_billing: '140.00',
    patient_collected: 60,
    revenue_per_hour: '14.00',
    cogs: null,
    gross_profit: null,
    procedures: '3',
    documents: 2,
    self_pay_visits: 1,
    panel_visits: 1,
  },
  doctors: [{
    doctor_id: 'doctor-1',
    doctor_name: 'Dr One',
    completed_visits: 1,
    unique_patients: 1,
    rostered_hours: '5.00',
    patients_per_hour: '0.20',
    visit_billing: '100.00',
    revenue_per_hour: '20.00',
    procedures: '2',
    documents: 1,
    missing_attribution: 0,
  }, {
    doctor_id: null,
    doctor_name: 'Clinic benchmark',
    completed_visits: 2,
    unique_patients: 2,
    rostered_hours: 10,
    patients_per_hour: null,
    visit_billing: 140,
    revenue_per_hour: null,
    procedures: 3,
    documents: 2,
    missing_attribution: 1,
  }],
  services: [{
    service_id: 'service-1',
    service_name: 'Procedure One',
    volume: '2',
    unique_patients: 1,
    revenue: '100.00',
    cogs: '20.00',
    profit: '80.00',
    margin_pct: '80.00',
    average_price: '50.00',
    trend_pct: null,
    doctor_count: 1,
    missing_cost_count: 0,
  }, {
    service_id: 'service-2',
    service_name: 'Missing-cost procedure',
    volume: 1,
    unique_patients: 1,
    revenue: 40,
    cogs: null,
    profit: null,
    margin_pct: null,
    average_price: 40,
    trend_pct: null,
    doctor_count: 1,
    missing_cost_count: 1,
  }],
  quality: {
    missing_attribution: 1,
    missing_cost_count: 1,
    excluded_voided_payments: 1,
  },
  confidence: {
    state: 'partial',
    missing_attribution: 1,
    missing_cost_count: 1,
  },
  generated_at: '2026-08-17T04:00:00.000Z',
};

describe('normalizeInsightPerformanceReport', () => {
  it('normalizes numeric JSON while preserving unavailable values and counters', () => {
    const report = normalizeInsightPerformanceReport(validPayload);

    expect(report.clinic).toMatchObject({
      completedVisits: 2,
      rosteredHours: 10,
      patientsPerHour: 0.2,
      visitBilling: 140,
      patientCollected: 60,
      cogs: null,
      grossProfit: null,
    });
    expect(report.doctors).toEqual(expect.arrayContaining([
      expect.objectContaining({ doctorId: 'doctor-1', revenuePerHour: 20 }),
      expect.objectContaining({
        doctorId: null,
        doctorName: 'Clinic benchmark',
        patientsPerHour: null,
        missingAttribution: 1,
      }),
    ]));
    expect(report.services[0]).toMatchObject({
      revenue: 100,
      cogs: 20,
      profit: 80,
      marginPct: 80,
      trendPct: null,
      missingCostCount: 0,
    });
    expect(report.services[1]).toMatchObject({
      cogs: null,
      profit: null,
      marginPct: null,
      missingCostCount: 1,
    });
    expect(report.quality).toEqual({
      missingAttribution: 1,
      missingCostCount: 1,
      excludedVoidedPayments: 1,
    });
    expect(report.confidence).toEqual({
      state: 'partial',
      missingAttribution: 1,
      missingCostCount: 1,
    });
  });

  it('parses per-doctor partial-cost financial metrics and tolerates their absence', () => {
    const withFinancials = {
      ...validPayload,
      doctors: [{
        ...validPayload.doctors[0],
        cogs: '32.50',
        gross_profit: '67.50',
        margin_pct: '67.50',
        missing_cost_count: 2,
      }],
    };
    const parsed = normalizeInsightPerformanceReport(withFinancials);
    expect(parsed.doctors[0]).toMatchObject({
      doctorId: 'doctor-1',
      cogs: 32.5,
      grossProfit: 67.5,
      marginPct: 67.5,
      missingCostCount: 2,
    });

    // Older cached payloads (and the clinic benchmark row) omit the keys entirely.
    const legacy = normalizeInsightPerformanceReport(validPayload);
    expect(legacy.doctors[0].cogs).toBeNull();
    expect(legacy.doctors[0].grossProfit).toBeNull();
    expect(legacy.doctors[0].marginPct).toBeNull();
    expect(legacy.doctors[0].missingCostCount).toBe(0);
  });

  it.each([
    null,
    {},
    { ...validPayload, doctors: {} },
    { ...validPayload, clinic: { ...validPayload.clinic, completed_visits: null } },
    { ...validPayload, services: [{ ...validPayload.services[0], missing_cost_count: -1 }] },
    { ...validPayload, confidence: { ...validPayload.confidence, state: 'unknown' } },
    { ...validPayload, generated_at: 'not-a-timestamp' },
  ])('rejects malformed report JSON instead of inventing values: %#', (payload) => {
    expect(() => normalizeInsightPerformanceReport(payload)).toThrow(/performance report/i);
  });
});
