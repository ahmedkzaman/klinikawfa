/**
 * Calculate a clinically meaningful age from a date_of_birth string.
 *
 * - missing/invalid DOB → "Age: Unknown"
 * - < 1 year           → "7m"
 * - 1 – 3 years        → "2y 4m"
 * - > 3 years          → "45y"
 *
 * Frontend-only: never persists, never throws.
 */
export function calculateClinicalAge(dob?: string | null): string {
  if (!dob) return 'Age: Unknown';
  const birth = new Date(dob);
  if (isNaN(birth.getTime())) return 'Age: Unknown';

  const now = new Date();
  let years = now.getFullYear() - birth.getFullYear();
  let months = now.getMonth() - birth.getMonth();
  if (now.getDate() < birth.getDate()) months -= 1;
  if (months < 0) {
    years -= 1;
    months += 12;
  }
  if (years < 0) return 'Age: Unknown';
  if (years < 1) return `${Math.max(months, 0)}m`;
  if (years <= 3) return `${years}y ${months}m`;
  return `${years}y`;
}
