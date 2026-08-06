import { normalizeName, normalizeNationalId, normalizePhone } from "./normalize.ts";
import type { ExistingPatient, MatchDecision, YezzaPatient } from "./types.ts";

export { normalizeName, normalizeNationalId, normalizePhone } from "./normalize.ts";
export type { ExistingPatient, MatchDecision, YezzaPatient } from "./types.ts";

function sameValue(left: string | null, right: string | null): boolean {
  return left !== null && right !== null && left === right;
}

function normalizedDate(value: string | null): string | null {
  const date = value?.trim();
  return date ? date : null;
}

function normalizedAddress(value: string | null): string | null {
  const address = value?.trim().replace(/\s+/g, " ");
  return address ? address.toLocaleLowerCase("en-US") : null;
}

function conflictsFor(source: YezzaPatient, patient: ExistingPatient): string[] {
  const conflicts: string[] = [];
  if (!sameValue(normalizeName(source.name), normalizeName(patient.name))) conflicts.push("name");
  if (!sameValue(normalizePhone(source.phone ?? ""), normalizePhone(patient.phone ?? ""))) conflicts.push("phone");
  if (!sameValue(normalizedDate(source.dateOfBirth), normalizedDate(patient.dateOfBirth))) conflicts.push("dateOfBirth");
  if (!sameValue(normalizedAddress(source.address), normalizedAddress(patient.address))) conflicts.push("address");
  return conflicts;
}

function decisionForSingleMatch(
  kind: "exact-id" | "phone-name-dob",
  reason: string,
  source: YezzaPatient,
  patient: ExistingPatient,
): MatchDecision {
  return {
    kind,
    existingPatientId: patient.id,
    reason,
    conflicts: conflictsFor(source, patient),
  };
}

export function matchYezzaPatient(source: YezzaPatient, existing: ExistingPatient[]): MatchDecision {
  const sourceIdentifier = normalizeNationalId(source.nationalId ?? "");
  if (sourceIdentifier) {
    const identifierMatches = existing.filter((patient) =>
      sourceIdentifier === normalizeNationalId(patient.nationalId ?? "") ||
      sourceIdentifier === normalizeNationalId(patient.passportNo ?? ""),
    );

    if (identifierMatches.length === 1) {
      const matchedNationalId = sourceIdentifier === normalizeNationalId(identifierMatches[0].nationalId ?? "");
      return decisionForSingleMatch(
        "exact-id",
        matchedNationalId ? "Exact national ID match" : "Exact passport match",
        source,
        identifierMatches[0],
      );
    }
    if (identifierMatches.length > 1) {
      return {
        kind: "review",
        reason: "National ID matches multiple Klinik Awfa patients",
        conflicts: [`duplicate-existing-national-id:${identifierMatches.map((patient) => patient.id).sort().join(",")}`],
      };
    }
  }

  const sourcePhone = normalizePhone(source.phone ?? "");
  const sourceName = normalizeName(source.name);
  const sourceDob = normalizedDate(source.dateOfBirth);
  if (sourcePhone && sourceName && sourceDob) {
    const phoneNameDobMatches = existing.filter((patient) =>
      sourcePhone === normalizePhone(patient.phone ?? "") &&
      sourceName === normalizeName(patient.name) &&
      sourceDob === normalizedDate(patient.dateOfBirth),
    );
    if (phoneNameDobMatches.length === 1) {
      return decisionForSingleMatch("phone-name-dob", "Exact phone, name, and date of birth match", source, phoneNameDobMatches[0]);
    }
    if (phoneNameDobMatches.length > 1) {
      return {
        kind: "review",
        reason: "Phone, name, and date of birth match multiple Klinik Awfa patients",
        conflicts: [`duplicate-existing-phone-name-dob:${phoneNameDobMatches.map((patient) => patient.id).sort().join(",")}`],
      };
    }
  }

  if (sourceName && sourceDob) {
    const nameDobMatches = existing.filter((patient) =>
      sourceName === normalizeName(patient.name) && sourceDob === normalizedDate(patient.dateOfBirth),
    );
    if (nameDobMatches.length > 0) {
      return {
        kind: "review",
        reason: "Name and date of birth match requires review",
        conflicts: [],
      };
    }
  }

  return { kind: "new", reason: "No deterministic patient match", conflicts: [] };
}
