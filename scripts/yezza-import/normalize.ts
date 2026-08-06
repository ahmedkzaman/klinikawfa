const nonAlphaNumeric = /[^\p{L}\p{N}]/gu;

export function normalizeNationalId(value: string): string | null {
  const normalized = value.trim().replace(nonAlphaNumeric, "").toUpperCase();
  return normalized.length > 0 ? normalized : null;
}

export function normalizePhone(value: string): string | null {
  const digits = value.replace(/\D/g, "");
  if (!digits) return null;

  const international = digits.startsWith("60")
    ? digits
    : digits.startsWith("0")
      ? `60${digits.slice(1)}`
      : null;

  if (!international || international.length < 10 || international.length > 12) return null;
  return `+${international}`;
}

export function normalizeName(value: string): string {
  return value.trim().toLocaleLowerCase("en-US").replace(/\s+/g, " ");
}
