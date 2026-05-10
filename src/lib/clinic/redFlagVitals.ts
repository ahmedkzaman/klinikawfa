/**
 * Clinical threshold check for triage red flags.
 * Returns a short label (e.g. "Critical BP: 190/130") if any threshold is
 * breached, else null. First match wins so the warning stays one line.
 *
 * Thresholds:
 *   - BP > 180 systolic OR > 120 diastolic
 *   - SpO₂ < 92% (and > 0)
 *   - HR > 130 bpm
 */
export interface VitalsLike {
  bp_systolic?: number | string | null;
  bp_diastolic?: number | string | null;
  spo2?: number | string | null;
  heart_rate?: number | string | null;
}

export function checkRedFlagVitals(vitals: VitalsLike | null | undefined): string | null {
  if (!vitals) return null;

  const sys = Number(vitals.bp_systolic);
  const dia = Number(vitals.bp_diastolic);
  if ((Number.isFinite(sys) && sys > 180) || (Number.isFinite(dia) && dia > 120)) {
    return `Critical BP: ${Number.isFinite(sys) ? sys : '—'}/${Number.isFinite(dia) ? dia : '—'}`;
  }

  const spo2 = Number(vitals.spo2);
  if (Number.isFinite(spo2) && spo2 > 0 && spo2 < 92) {
    return `Critical SpO₂: ${spo2}%`;
  }

  const hr = Number(vitals.heart_rate);
  if (Number.isFinite(hr) && hr > 130) {
    return `Critical HR: ${hr} bpm`;
  }

  return null;
}
