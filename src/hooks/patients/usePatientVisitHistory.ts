import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { ClinicStatus } from '@/types/clinic';

export interface PatientVisitConsultation {
  id: string;
  doctor_id: string | null;
  diagnosis_text: string | null;
  case_note: string | null;
  doctors: { id: string; name: string } | { id: string; name: string }[] | null;
  /**
   * PostgREST aggregate — `consultation_attachments(count)` returns an array
   * of length 1 with the count, e.g. `[{ count: 3 }]`. We surface this so the
   * patient-history sheet can render an attachment-count badge per visit
   * WITHOUT mounting a per-row attachment hook (avoids N+1 signed-URL calls).
   */
  consultation_attachments?: { count: number }[] | null;
}

export interface PatientVisitHistoryRow {
  id: string;
  created_at: string;
  queue_number: number | null;
  clinic_status: ClinicStatus;
  visit_notes: string | null;
  consultations:
    | PatientVisitConsultation
    | PatientVisitConsultation[]
    | null;
}

/** Helper to safely read the joined attachment count off a consultation. */
export function getAttachmentCount(
  c: PatientVisitConsultation | null | undefined,
): number {
  return c?.consultation_attachments?.[0]?.count ?? 0;
}

export function usePatientVisitHistory(patientId: string | null) {
  return useQuery<PatientVisitHistoryRow[]>({
    queryKey: ['clinic', 'patient-visit-history', patientId],
    enabled: !!patientId,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('queue_entries')
        .select(
          `
          id, created_at, queue_number, clinic_status, visit_notes,
          consultations:consultations!consultations_queue_entry_id_fkey (
            id, doctor_id, diagnosis_text, case_note,
            doctors:doctor_id ( id, name ),
            consultation_attachments ( count )
          )
        `,
        )
        .eq('patient_id', patientId as string)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(10);

      if (error) throw error;
      return (data ?? []) as unknown as PatientVisitHistoryRow[];
    },
  });
}
