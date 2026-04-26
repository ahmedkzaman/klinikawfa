import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface ClinicAppointmentWithDoctor {
  id: string;
  patient_id: string;
  doctor_id: string | null;
  appointment_date: string;
  appointment_time: string;
  status: string;
  notes: string | null;
  doctors: { id: string; name: string; avatar_url: string | null } | null;
}

/**
 * Reads from `clinic_appointments` (the clinical scheduling table) — NOT the
 * public `appointments` lead-form table. Optionally filters by `patientId`.
 */
export function useClinicAppointments(patientId?: string) {
  return useQuery<ClinicAppointmentWithDoctor[]>({
    queryKey: ['clinic', 'clinic_appointments', patientId ?? 'all'],
    queryFn: async () => {
      let q = supabase
        .from('clinic_appointments')
        .select('*, doctors:doctor_id(id, name, avatar_url)')
        .order('appointment_date', { ascending: true })
        .order('appointment_time', { ascending: true });
      if (patientId) q = q.eq('patient_id', patientId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as ClinicAppointmentWithDoctor[];
    },
  });
}

/**
 * Fetches a patient's UPCOMING (future) clinic appointments — used by the
 * shared FollowUpScheduler to prevent double-booking.
 *
 * Filters server-side by appointment_date >= today and status <> cancelled,
 * then prunes today's already-passed time slots client-side (the table stores
 * date and time as separate columns, so a single SQL comparison isn't possible
 * without a generated column).
 */
export function usePatientFutureAppointments(patientId?: string) {
  return useQuery<ClinicAppointmentWithDoctor[]>({
    queryKey: ['clinic', 'clinic_appointments', 'future', patientId ?? null],
    enabled: !!patientId,
    queryFn: async () => {
      const today = new Date();
      const yyyy = today.getFullYear();
      const mm = String(today.getMonth() + 1).padStart(2, '0');
      const dd = String(today.getDate()).padStart(2, '0');
      const todayStr = `${yyyy}-${mm}-${dd}`;

      const { data, error } = await supabase
        .from('clinic_appointments')
        .select('*, doctors:doctor_id(id, name, avatar_url)')
        .eq('patient_id', patientId!)
        .neq('status', 'cancelled')
        .gte('appointment_date', todayStr)
        .order('appointment_date', { ascending: true })
        .order('appointment_time', { ascending: true });

      if (error) throw error;

      const rows = (data ?? []) as unknown as ClinicAppointmentWithDoctor[];
      // Drop today's slots whose time has already passed.
      const nowMinutes = today.getHours() * 60 + today.getMinutes();
      return rows.filter((r) => {
        if (r.appointment_date !== todayStr) return true;
        const [h, m] = (r.appointment_time ?? '00:00').split(':').map(Number);
        return h * 60 + m >= nowMinutes;
      });
    },
  });
}

export interface CreateClinicAppointmentInput {
  patient_id: string;
  doctor_id?: string | null;
  appointment_date: string; // YYYY-MM-DD
  appointment_time: string; // HH:MM
  notes?: string | null;
}

/**
 * Inserts a new clinic appointment. Status defaults to 'scheduled' server-side.
 * Invalidates all clinic_appointments query variants on success.
 */
export function useCreateClinicAppointment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateClinicAppointmentInput) => {
      const { data, error } = await supabase
        .from('clinic_appointments')
        .insert({
          patient_id: input.patient_id,
          doctor_id: input.doctor_id ?? null,
          appointment_date: input.appointment_date,
          appointment_time: input.appointment_time,
          notes: input.notes ?? null,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['clinic', 'clinic_appointments'] });
    },
  });
}
