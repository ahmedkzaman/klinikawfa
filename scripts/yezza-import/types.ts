export interface YezzaPatient {
  sourcePatientId: string;
  name: string;
  nationalId: string | null;
  phone: string | null;
  dateOfBirth: string | null;
  address: string | null;
}

export interface ExistingPatient {
  id: string;
  name: string;
  nationalId: string | null;
  passportNo?: string | null;
  phone: string | null;
  dateOfBirth: string | null;
  address: string | null;
}

export type MatchDecision = {
  kind: "exact-id" | "phone-name-dob" | "review" | "new";
  existingPatientId?: string;
  reason: string;
  conflicts: string[];
};
