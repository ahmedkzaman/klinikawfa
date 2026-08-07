const YEZZA_AUDIT_SUFFIX = /\s*source_system=yezza;\s*source_visit_id=[^\s;]+\s*$/i;

export function displayClinicalNote(value: string | null | undefined): string {
  return (value ?? '')
    .replace(YEZZA_AUDIT_SUFFIX, '')
    .replaceAll('&amp;', '&')
    .trim();
}
