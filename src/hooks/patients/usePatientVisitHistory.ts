import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { ClinicStatus } from '@/types/clinic';

export interface PatientVisitBillingItem {
  id: string;
  item_name: string;
  quantity: number;
  price: number;
}

export interface PatientVisitConsultation {
  id: string;
  doctor_id: string | null;
  diagnosis_text: string | null;
  case_note: string | null;
  dispense_note: string | null;
  doctors: { id: string; name: string } | { id: string; name: string }[] | null;
  /**
   * Active line items for this consultation (soft-deleted excluded). Powers
   * the "Billing Items" section of the past-visit card in PatientProfileSheet.
   */
  consultation_items?: PatientVisitBillingItem[] | null;
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
            id, doctor_id, diagnosis_text, case_note, dispense_note,
            doctors:doctor_id ( id, name ),
            consultation_items!left ( id, item_name, quantity, price, deleted_at ),
            consultation_attachments ( count )
          )
        `,
        )
        .eq('patient_id', patientId as string)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(10);

      if (error) throw error;

      // Filter out soft-deleted billing items client-side (PostgREST nested
      // .is() filters can't easily target a doubly-nested table).
      const rows = (data ?? []) as unknown as PatientVisitHistoryRow[];
      for (const r of rows) {
        const cs = Array.isArray(r.consultations) ? r.consultations : r.consultations ? [r.consultations] : [];
        for (const c of cs) {
          if (c?.consultation_items) {
            c.consultation_items = c.consultation_items.filter(
              (it: PatientVisitBillingItem & { deleted_at?: string | null }) =>
                !it.deleted_at,
            );
          }
        }
      }
      return rows;
    },
  });
}
