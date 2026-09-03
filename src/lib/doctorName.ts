/**
 * Normalize a doctor's display name so an honorific prefix is never duplicated.
 *
 * The `doctors.name` column is inconsistent: some rows already include a title
 * ("Dr. Ahmed bin Kamarulzaman") while others do not ("ABDUL HANNAN BIN ABDUL
 * AZIZ"). UI that blindly renders `Dr. {name}` therefore shows "Dr. Dr. ..."
 * for titled rows. These helpers strip any leading honorific and re-apply a
 * single canonical one.
 */

// Matches a leading medical/honorific title followed by whitespace or end.
// Handles "Dr", "Dr.", "DR.", "Dato", "Dato'", "Datuk", "Datin", "Dr." with
// extra spaces, etc. Case-insensitive.
const LEADING_HONORIFIC = /^\s*(?:dr|dato'?|datuk|datin|prof|professor|mr|mrs|ms|haji|hajah)\.?\s+/i;

/** Strip any leading honorific/title from a stored name. */
export function stripDoctorHonorific(name: string | null | undefined): string {
  return (name ?? '').trim().replace(LEADING_HONORIFIC, '').trim();
}

/**
 * Return the name with exactly one "Dr." prefix.
 * "Dr. Ahmed" -> "Dr. Ahmed"; "ABDUL HANNAN" -> "Dr. ABDUL HANNAN".
 * Empty/blank input yields an empty string so callers can fall back.
 */
export function formatDoctorName(name: string | null | undefined): string {
  const bare = stripDoctorHonorific(name);
  return bare ? `Dr. ${bare}` : '';
}
