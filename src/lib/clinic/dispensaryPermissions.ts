const ACTIVE_DISPENSARY_STATUSES = new Set([
  'sent_to_dispensary',
  'dispensing_payment',
]);

export function canEditDispensary(
  roleIsLocum: boolean,
  clinicStatus: string | null | undefined,
  consultationCanEdit: boolean,
): boolean {
  if (roleIsLocum) return false;
  return ACTIVE_DISPENSARY_STATUSES.has(clinicStatus ?? '') || consultationCanEdit;
}
