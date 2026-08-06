import { useState } from "react";
import { Download, Search } from "lucide-react";
import { toast } from "sonner";
import { SEOHead } from "@/components/seo/SEOHead";
import { PatientProfileSheet } from "@/components/patients/PatientProfileSheet";
import { PatientExplorerFilters } from "@/components/clinic/patientExplorer/PatientExplorerFilters";
import { PatientExplorerResults } from "@/components/clinic/patientExplorer/PatientExplorerResults";
import { Button } from "@/components/ui/button";
import { usePatientExplorer } from "@/hooks/clinic/usePatientExplorer";
import {
  buildPatientExplorerRpcArgs,
  normalizePatientExplorerFilters,
  serializePatientExplorerCsv,
} from "@/lib/clinic/patientExplorer";
import { bento, pageInner, pageShell, secondaryBtn } from "@/lib/clinic/bentoTokens";
import type {
  PatientExplorerFilters as PatientExplorerFiltersValue,
  PatientExplorerRow,
} from "@/types/patientExplorer";
import type { PatientRow } from "@/types/clinic";

const pageSize = 50;
const exportPageSize = 100;
const defaultFilters = (): PatientExplorerFiltersValue => normalizePatientExplorerFilters({});

interface PatientExplorerRpcRow {
  patient_id: string;
  patient_name: string;
  ic_number: string | null;
  phone: string | null;
  address: string | null;
  postcode: string | null;
  gender: string | null;
  date_of_birth: string | null;
  current_age: number | null;
  matching_visit_dates: string[];
  visit_count: number;
  diagnoses: string[];
  blood_investigations: string[];
  procedures: string[];
  medicines: string[];
  consultation_statuses: string[];
  attending_doctors: string[];
}

interface PatientExplorerRpcResponse {
  rows: PatientExplorerRpcRow[];
  total_count: number;
}

function normalizeExportRow(row: PatientExplorerRpcRow): PatientExplorerRow {
  return {
    patientId: row.patient_id,
    patientName: row.patient_name,
    icNumber: row.ic_number,
    phone: row.phone,
    address: row.address,
    postcode: row.postcode,
    gender: row.gender,
    dateOfBirth: row.date_of_birth,
    currentAge: row.current_age,
    matchingVisitDates: row.matching_visit_dates,
    visitCount: row.visit_count,
    diagnoses: row.diagnoses,
    bloodInvestigations: row.blood_investigations,
    procedures: row.procedures,
    medicines: row.medicines,
    consultationStatuses: row.consultation_statuses,
    attendingDoctors: row.attending_doctors,
  };
}

async function fetchExportRows(filters: PatientExplorerFiltersValue): Promise<PatientExplorerRow[]> {
  const { supabase } = await import("@/integrations/supabase/client");
  const rows: PatientExplorerRow[] = [];
  let exportPage = 1;
  let totalCount: number | null = null;

  do {
    const args = buildPatientExplorerRpcArgs(filters, { page: exportPage, pageSize: exportPageSize });
    // The deployed RPC returns JSON and may not exist in generated Supabase types yet.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any).rpc("search_patient_explorer", args);
    if (error) throw error;

    const response = data as PatientExplorerRpcResponse | null;
    if (!response || !Array.isArray(response.rows) || !Number.isInteger(response.total_count)) {
      throw new Error("Patient export returned an invalid response.");
    }

    rows.push(...response.rows.map(normalizeExportRow));
    totalCount = response.total_count;
    if (rows.length < totalCount && response.rows.length === 0) {
      throw new Error("Patient export ended before all results were retrieved.");
    }
    exportPage += 1;
  } while (rows.length < (totalCount ?? 0));

  return rows;
}

function exportFilename(filters: PatientExplorerFiltersValue): string {
  const scope = filters.dateMode === "custom"
    ? `${filters.startDate}-to-${filters.endDate}`
    : "all-time";
  return `patient-explorer-${scope}.csv`;
}

function profilePatient(row: PatientExplorerRow): PatientRow {
  return {
    id: row.patientId,
    name: row.patientName,
    national_id: row.icNumber,
    phone: row.phone,
    address: row.address,
    date_of_birth: row.dateOfBirth,
    gender: row.gender,
    created_at: "",
    updated_at: "",
    registration_date: "",
    allergies: null,
    default_panel_id: null,
    email: null,
    emergency_contact_name: null,
    emergency_contact_phone: null,
    id_type: "national_id",
    notes: null,
    panel_remarks: null,
    passport_no: null,
    principal_id: null,
    reg_no: null,
    relationship: null,
    religion: null,
    state_of_birth: null,
    underlying_conditions: null,
  };
}

export default function PatientExplorer() {
  const [draftFilters, setDraftFilters] = useState(defaultFilters);
  const [appliedFilters, setAppliedFilters] = useState<PatientExplorerFiltersValue | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [selectedPatient, setSelectedPatient] = useState<PatientRow | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const query = usePatientExplorer(appliedFilters, page, pageSize);

  const applyFilters = () => {
    try {
      const normalized = normalizePatientExplorerFilters(draftFilters);
      setValidationError(null);
      setAppliedFilters(normalized);
      setPage(1);
    } catch (error) {
      setValidationError(error instanceof Error ? error.message : "Unable to apply filters.");
    }
  };

  const clearFilters = () => {
    setDraftFilters(defaultFilters());
    setAppliedFilters(null);
    setValidationError(null);
    setPage(1);
  };

  const exportResults = async () => {
    if (!appliedFilters || isExporting) return;

    setIsExporting(true);
    try {
      const rows = await fetchExportRows(appliedFilters);
      const blob = new Blob([serializePatientExplorerCsv(rows)], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = exportFilename(appliedFilters);
      link.click();
      URL.revokeObjectURL(url);
      toast.success(`Exported ${rows.length} patient${rows.length === 1 ? "" : "s"}.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to export patient results.");
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <>
      <SEOHead title="Patient Explorer - Clinic Portal" description="Search patients and matching visits." noIndex />
      <div className={pageShell}><div className={pageInner}>
        <div className={`${bento} flex flex-wrap items-center justify-between gap-3 p-4`}><div><h1 className="text-2xl font-semibold text-slate-800">Patient Explorer</h1><p className="mt-0.5 text-sm text-slate-500">Find patients by demographics and their matching visit history.</p></div><div className="flex items-center gap-2"><Button type="button" variant="ghost" className={secondaryBtn} aria-label="Export filtered results" disabled={appliedFilters === null || isExporting} onClick={exportResults}><Download />{isExporting ? "Exporting..." : "Export"}</Button><Search className="h-6 w-6 text-blue-600" aria-hidden="true" /></div></div>
        <PatientExplorerFilters value={draftFilters} error={validationError} onChange={setDraftFilters} onApply={applyFilters} onClear={clearFilters} />
        <PatientExplorerResults hasApplied={appliedFilters !== null} rows={query.rows} totalCount={query.totalCount} page={query.page} pageSize={query.pageSize} isLoading={query.isLoading} isFetching={query.isFetching} error={query.error} onPageChange={setPage} onViewProfile={(row) => { setSelectedPatient(profilePatient(row)); setProfileOpen(true); }} />
      </div></div>
      <PatientProfileSheet patient={selectedPatient} isOpen={profileOpen} onClose={() => setProfileOpen(false)} onRegisterVisit={() => setProfileOpen(false)} />
    </>
  );
}
