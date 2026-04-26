import type { Database } from '@/integrations/supabase/types';

// Row aliases — single import surface for clinic features.
export type PatientRow = Database['public']['Tables']['patients']['Row'];
export type PatientInsert = Database['public']['Tables']['patients']['Insert'];
export type QueueEntryRow = Database['public']['Tables']['queue_entries']['Row'];
export type AppointmentRow = Database['public']['Tables']['appointments']['Row'];
export type ConsultationRow = Database['public']['Tables']['consultations']['Row'];
export type ConsultationItemRow = Database['public']['Tables']['consultation_items']['Row'];
export type PaymentRow = Database['public']['Tables']['payments']['Row'];

/** Mirrors the DB enum `clinic_status`. Keep in sync. */
export type ClinicStatus =
  | 'registered'
  | 'ready_for_doctor'
  | 'with_doctor'
  | 'sent_to_dispensary'
  | 'dispensing_payment'
  | 'on_hold'
  | 'completed';

export const STATUS_LABELS: Record<ClinicStatus, string> = {
  registered: 'Registered',
  ready_for_doctor: 'Ready for Doctor',
  with_doctor: 'With Doctor',
  sent_to_dispensary: 'Dispensary',
  dispensing_payment: 'Payment',
  on_hold: 'On Hold',
  completed: 'Completed',
};

/** Soft, desaturated palette aligned with the clinic bento design. */
export const STATUS_COLORS: Record<ClinicStatus, string> = {
  registered: 'bg-slate-50 text-slate-600 border-transparent',
  ready_for_doctor: 'bg-blue-50 text-blue-700 border-transparent',
  with_doctor: 'bg-emerald-50 text-emerald-700 border-transparent',
  sent_to_dispensary: 'bg-violet-50 text-violet-700 border-transparent',
  dispensing_payment: 'bg-amber-50 text-amber-700 border-transparent',
  on_hold: 'bg-rose-50 text-rose-700 border-transparent',
  completed: 'bg-emerald-50 text-emerald-700 border-transparent',
};

/** Five visible columns for the kanban board (completed/cancelled drop off). */
export const QUEUE_COLUMNS: Array<{
  key: string;
  label: string;
  statuses: ClinicStatus[];
}> = [
  { key: 'registered', label: 'Registered', statuses: ['registered'] },
  { key: 'ready', label: 'Ready for Doctor', statuses: ['ready_for_doctor'] },
  { key: 'with_doctor', label: 'With Doctor', statuses: ['with_doctor'] },
  {
    key: 'dispensary',
    label: 'Dispensary / Payment',
    statuses: ['sent_to_dispensary', 'dispensing_payment'],
  },
  { key: 'on_hold', label: 'On Hold', statuses: ['on_hold'] },
];

export type QueueEntryWithJoins = QueueEntryRow & {
  patients:
    | (Partial<Database['public']['Tables']['patients']['Row']> & {
        name: string;
        phone: string | null;
      })
    | null;
  doctors:
    | { id?: string; name: string; avatar_url?: string | null }
    | null;
  rooms?: { id: string; label: string } | null;
  insurance_providers?: { id: string; name: string } | null;
};
