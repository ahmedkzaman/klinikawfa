export type PatientExplorerDateMode = "all_time" | "custom";

export interface PatientExplorerFilters {
  dateMode: PatientExplorerDateMode;
  startDate: string | null;
  endDate: string | null;
  patientName: string;
  icNumber: string;
  phone: string;
  address: string;
  postcode: string;
  gender: string;
  ageMin: number | null;
  ageMax: number | null;
  diagnoses: string[];
  bloodInvestigations: string[];
  procedures: string[];
  medicines: string[];
  consultationStatuses: string[];
  attendingDoctors: string[];
}

export interface PatientExplorerVisitSummary {
  matchingVisitDates: string[];
  visitCount: number;
  diagnoses: string[];
  bloodInvestigations: string[];
  procedures: string[];
  medicines: string[];
  consultationStatuses: string[];
  attendingDoctors: string[];
}

export interface PatientExplorerRow extends PatientExplorerVisitSummary {
  patientId: string;
  patientName: string;
  icNumber: string | null;
  phone: string | null;
  address: string | null;
  postcode: string | null;
  gender: string | null;
  dateOfBirth: string | null;
  currentAge: number | null;
}

export interface PatientExplorerResponse {
  rows: PatientExplorerRow[];
  totalCount: number;
  page: number;
  pageSize: number;
}
