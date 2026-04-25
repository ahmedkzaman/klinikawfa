/**
 * Shared option lists for prescribing UI (master inventory defaults +
 * per-consultation TreatmentItemCard). Keeping these in one place ensures
 * the dropdowns stay consistent across the app.
 */

export const INDICATION_OPTIONS = [
  'For pain',
  'For fever',
  'For infection',
  'For inflammation',
  'For cough',
  'For allergy',
  'For hypertension',
  'For diabetes',
  'For gastric',
  'Supplement',
];

export const DOSAGE_UNIT_OPTIONS = [
  'tablet',
  'capsule',
  'ml',
  'mg',
  'puff',
  'drop',
  'sachet',
  'patch',
  'suppository',
];

export const FREQUENCY_OPTIONS = [
  'OD',
  'BD',
  'TDS',
  'QID',
  'PRN',
  'STAT',
  'ON',
  'OM',
  'Q4H',
  'Q6H',
  'Q8H',
  'Q12H',
];

export const INSTRUCTION_OPTIONS = [
  'Before meal',
  'After meal',
  'With food',
  'At bedtime',
  'On empty stomach',
  'As needed',
  'Topical application',
];

export const DURATION_OPTIONS = [
  '1 day',
  '2 days',
  '3 days',
  '5 days',
  '7 days',
  '10 days',
  '14 days',
  '21 days',
  '30 days',
  '60 days',
  '90 days',
];

export const DURATION_UNIT_OPTIONS = ['days', 'weeks', 'months'];

export const PRECAUTION_OPTIONS = [
  'May cause drowsiness',
  'Avoid alcohol',
  'Take with water',
  'Avoid driving',
  'Keep refrigerated',
  'Shake well before use',
  'For external use only',
];
