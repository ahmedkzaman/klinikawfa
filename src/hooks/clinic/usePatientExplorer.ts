import { useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  buildPatientExplorerRpcArgs,
  normalizePatientExplorerFilters,
  type PatientExplorerFilterInput,
} from "@/lib/clinic/patientExplorer";
import type {
  PatientExplorerResponse,
  PatientExplorerRow,
} from "@/types/patientExplorer";

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
  page: number;
  page_size: number;
}

function normalizeRow(row: PatientExplorerRpcRow): PatientExplorerRow {
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

function normalizeResponse(response: PatientExplorerRpcResponse): PatientExplorerResponse {
  return {
    rows: response.rows.map(normalizeRow),
    totalCount: response.total_count,
    page: response.page,
    pageSize: response.page_size,
  };
}

export function usePatientExplorer(
  filters: PatientExplorerFilterInput | null | undefined,
  page: number,
  pageSize: number,
) {
  const normalizedFilters = filters == null ? null : normalizePatientExplorerFilters(filters);
  const serializedFilters = normalizedFilters == null ? null : JSON.stringify(normalizedFilters);
  const previousFilters = useRef(serializedFilters);
  let effectivePage = page;

  if (serializedFilters !== previousFilters.current) {
    effectivePage = serializedFilters == null ? page : 1;
    previousFilters.current = serializedFilters;
  }

  const query = useQuery<PatientExplorerResponse>({
    queryKey: ["clinic", "patient-explorer", serializedFilters, effectivePage, pageSize],
    enabled: normalizedFilters !== null,
    queryFn: async () => {
      const args = buildPatientExplorerRpcArgs(normalizedFilters ?? {}, {
        page: effectivePage,
        pageSize,
      });
      // The deployed RPC returns JSON and may not exist in generated Supabase types yet.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc("search_patient_explorer", args);
      if (error) throw error;
      return normalizeResponse(data as PatientExplorerRpcResponse);
    },
  });

  return {
    ...query,
    rows: query.data?.rows ?? [],
    totalCount: query.data?.totalCount ?? 0,
    page: query.data?.page ?? effectivePage,
    pageSize: query.data?.pageSize ?? pageSize,
  };
}
