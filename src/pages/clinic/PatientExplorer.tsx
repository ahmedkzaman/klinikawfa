import { useState } from "react";
import { Search } from "lucide-react";
import { SEOHead } from "@/components/seo/SEOHead";
import { PatientProfileSheet } from "@/components/patients/PatientProfileSheet";
import { PatientExplorerFilters } from "@/components/clinic/patientExplorer/PatientExplorerFilters";
import { PatientExplorerResults } from "@/components/clinic/patientExplorer/PatientExplorerResults";
import { usePatientExplorer } from "@/hooks/clinic/usePatientExplorer";
import { normalizePatientExplorerFilters } from "@/lib/clinic/patientExplorer";
import { bento, pageInner, pageShell } from "@/lib/clinic/bentoTokens";
import type { PatientExplorerFilters as PatientExplorerFiltersValue, PatientExplorerRow } from "@/types/patientExplorer";
import type { PatientRow } from "@/types/clinic";

const pageSize = 50;
const defaultFilters = (): PatientExplorerFiltersValue => normalizePatientExplorerFilters({});

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

  return (
    <>
      <SEOHead title="Patient Explorer - Clinic Portal" description="Search patients and matching visits." noIndex />
      <div className={pageShell}><div className={pageInner}>
        <div className={`${bento} flex flex-wrap items-center justify-between gap-3 p-4`}><div><h1 className="text-2xl font-semibold text-slate-800">Patient Explorer</h1><p className="mt-0.5 text-sm text-slate-500">Find patients by demographics and their matching visit history.</p></div><Search className="h-6 w-6 text-blue-600" aria-hidden="true" /></div>
        <PatientExplorerFilters value={draftFilters} error={validationError} onChange={setDraftFilters} onApply={applyFilters} onClear={clearFilters} />
        <PatientExplorerResults hasApplied={appliedFilters !== null} rows={query.rows} totalCount={query.totalCount} page={query.page} pageSize={query.pageSize} isLoading={query.isLoading} isFetching={query.isFetching} error={query.error} onPageChange={setPage} onViewProfile={(row) => { setSelectedPatient(profilePatient(row)); setProfileOpen(true); }} />
      </div></div>
      <PatientProfileSheet patient={selectedPatient} isOpen={profileOpen} onClose={() => setProfileOpen(false)} onRegisterVisit={() => setProfileOpen(false)} />
    </>
  );
}
