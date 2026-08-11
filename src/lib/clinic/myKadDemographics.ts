export interface MyKadDemographics {
  dateOfBirth: string;
  gender: "male" | "female";
}

export function deriveMyKadDemographics(
  nationalId: string | null | undefined,
  today = new Date(),
): MyKadDemographics | null {
  const digits = (nationalId ?? "").replace(/\D/g, "");
  if (!/^\d{12}$/.test(digits)) return null;

  const shortYear = Number(digits.slice(0, 2));
  const month = Number(digits.slice(2, 4));
  const day = Number(digits.slice(4, 6));
  const currentShortYear = today.getUTCFullYear() % 100;
  const year = (shortYear <= currentShortYear ? 2000 : 1900) + shortYear;
  const candidate = new Date(Date.UTC(year, month - 1, day));

  if (
    candidate.getUTCFullYear() !== year ||
    candidate.getUTCMonth() !== month - 1 ||
    candidate.getUTCDate() !== day ||
    candidate.getTime() > today.getTime()
  ) {
    return null;
  }

  return {
    dateOfBirth: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
    gender: Number(digits.at(-1)) % 2 === 0 ? "female" : "male",
  };
}
