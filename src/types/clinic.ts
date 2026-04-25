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

/** Semantic-token Tailwind classes only — never raw colors. */
export const STATUS_COLORS: Record<ClinicStatus, string> = {
  registered: 'bg-muted text-muted-foreground border-border',
  ready_for_doctor: 'bg-primary/10 text-primary border-primary/20',
  with_doctor: 'bg-accent text-accent-foreground border-border',
  sent_to_dispensary: 'bg-secondary text-secondary-foreground border-border',
  dispensing_payment: 'bg-secondary text-secondary-foreground border-border',
  on_hold: 'bg-destructive/10 text-destructive border-destructive/20',
  completed: 'bg-primary/10 text-primary border-primary/20',
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
