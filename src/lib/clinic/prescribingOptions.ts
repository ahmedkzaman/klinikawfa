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
  'EOD',
  'Q4H',
  'Q6H',
  'Q8H',
  'Q12H',
];

/**
 * Bilingual (EN / BM) human-readable label for each frequency short code.
 * The DB stores the short code (e.g. "OD"); UI dropdowns and the drug-label
 * printer translate via this map so reports stay clean while patients get
 * fully translated sticker instructions.
 */
export const FREQUENCY_LABELS: Record<string, string> = {
  OD:   'Once a day / 1 kali sehari',
  BD:   'Twice a day / 2 kali sehari',
  TDS:  '3 times a day / 3 kali sehari',
  QID:  '4 times a day / 4 kali sehari',
  PRN:  'When necessary / Jika perlu',
  STAT: 'Immediately / Segera',
  ON:   'At night / Pada waktu malam',
  OM:   'In the morning / Pada waktu pagi',
  EOD:  'Every other day / Selang sehari',
  Q4H:  'Every 4 hours / Setiap 4 jam',
  Q6H:  'Every 6 hours / Setiap 6 jam',
  Q8H:  'Every 8 hours / Setiap 8 jam',
  Q12H: 'Every 12 hours / Setiap 12 jam',
};

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
