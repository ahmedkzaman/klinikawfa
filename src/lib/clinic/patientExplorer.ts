import type {
  PatientExplorerFilters,
  PatientExplorerRow,
} from "@/types/patientExplorer";

export interface PatientExplorerFilterInput {
  dateMode?: PatientExplorerFilters["dateMode"];
  startDate?: string | null;
  endDate?: string | null;
  patientName?: string | null;
  icNumber?: string | null;
  phone?: string | null;
  address?: string | null;
  postcode?: string | null;
  gender?: string | null;
  ageMin?: number | null;
  ageMax?: number | null;
  diagnoses?: readonly string[] | null;
  bloodInvestigations?: readonly string[] | null;
  procedures?: readonly string[] | null;
  medicines?: readonly string[] | null;
  consultationStatuses?: readonly string[] | null;
  attendingDoctors?: readonly string[] | null;
}

export interface PatientExplorerPage {
  page?: number;
  pageSize?: number;
}

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;
const CSV_HEADERS = [
  "Patient Name",
  "IC Number",
  "Phone",
  "Address",
  "Postcode",
  "Gender",
  "Date of Birth",
  "Current Age",
  "Matching Visit Dates",
  "Visit Count",
  "Diagnoses",
  "Blood Investigations",
  "Procedures/Services",
  "Medicines",
  "Consultation Statuses",
  "Attending Doctors",
] as const;

function normalizeText(value: string | null | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeList(values: readonly string[] | null | undefined): string[] {
  const normalized = new Map<string, string>();
  for (const value of values ?? []) {
    const text = normalizeText(value);
    const key = text.toLowerCase();
    if (text && !normalized.has(key)) normalized.set(key, text);
  }
  return [...normalized.values()].sort();
}

function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function dateDistanceInclusive(startDate: string, endDate: string): number {
  const start = Date.parse(`${startDate}T00:00:00Z`);
  const end = Date.parse(`${endDate}T00:00:00Z`);
  return Math.floor((end - start) / 86_400_000) + 1;
}

function normalizeAge(value: number | null | undefined, label: string): number | null {
  if (value === null || value === undefined) return null;
  if (!Number.isInteger(value) || value < 0 || value > 150) {
    throw new Error(`${label} age must be between 0 and 150`);
  }
  return value;
}

export function normalizePatientExplorerFilters(
  filters: PatientExplorerFilterInput = {},
): PatientExplorerFilters {
  const dateMode = filters.dateMode ?? "all_time";
  if (dateMode !== "all_time" && dateMode !== "custom") {
    throw new Error("date mode must be all_time or custom");
  }

  let startDate: string | null = null;
  let endDate: string | null = null;
  if (dateMode === "custom") {
    startDate = normalizeText(filters.startDate);
    endDate = normalizeText(filters.endDate);
    if (!startDate || !endDate || !isIsoDate(startDate) || !isIsoDate(endDate)) {
      throw new Error("custom range requires valid dates");
    }
    if (endDate < startDate) throw new Error("end date must not be before start date");
    if (dateDistanceInclusive(startDate, endDate) > 365) {
      throw new Error("custom range cannot exceed 365 calendar days");
    }
  }

  const ageMin = normalizeAge(filters.ageMin, "minimum");
  const ageMax = normalizeAge(filters.ageMax, "maximum");
  if (ageMin !== null && ageMax !== null && ageMin > ageMax) {
    throw new Error("minimum age must not exceed maximum age");
  }

  return {
    dateMode,
    startDate,
    endDate,
    patientName: normalizeText(filters.patientName),
    icNumber: normalizeText(filters.icNumber),
    phone: normalizeText(filters.phone),
    address: normalizeText(filters.address),
    postcode: normalizeText(filters.postcode),
    gender: normalizeText(filters.gender),
    ageMin,
    ageMax,
    diagnoses: normalizeList(filters.diagnoses),
    bloodInvestigations: normalizeList(filters.bloodInvestigations),
    procedures: normalizeList(filters.procedures),
    medicines: normalizeList(filters.medicines),
    consultationStatuses: normalizeList(filters.consultationStatuses),
    attendingDoctors: normalizeList(filters.attendingDoctors),
  };
}

export function buildPatientExplorerRpcArgs(
  filters: PatientExplorerFilterInput,
  page: PatientExplorerPage | number = {},
) {
  const normalized = normalizePatientExplorerFilters(filters);
  const requestedPage = typeof page === "number" ? page : page.page ?? DEFAULT_PAGE;
  const requestedPageSize = typeof page === "number" ? DEFAULT_PAGE_SIZE : page.pageSize ?? DEFAULT_PAGE_SIZE;
  if (!Number.isInteger(requestedPage) || requestedPage < 1) throw new Error("page must be at least 1");
  if (!Number.isInteger(requestedPageSize) || requestedPageSize < 1 || requestedPageSize > MAX_PAGE_SIZE) {
    throw new Error(`page size must be between 1 and ${MAX_PAGE_SIZE}`);
  }
  return { p_filters: normalized, p_page: requestedPage, p_page_size: requestedPageSize };
}

function csvCell(value: unknown): string {
  const text = Array.isArray(value) ? value.join("; ") : value == null ? "" : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function serializePatientExplorerCsv(rows: readonly PatientExplorerRow[]): string {
  const lines = [CSV_HEADERS.join(",")];
  for (const row of rows) {
    lines.push([
      row.patientName,
      row.icNumber,
      row.phone,
      row.address,
      row.postcode,
      row.gender,
      row.dateOfBirth,
      row.currentAge,
      row.matchingVisitDates,
      row.visitCount,
      row.diagnoses,
      row.bloodInvestigations,
      row.procedures,
      row.medicines,
      row.consultationStatuses,
      row.attendingDoctors,
    ].map(csvCell).join(","));
  }
  return `${lines.join("\n")}\n`;
}
