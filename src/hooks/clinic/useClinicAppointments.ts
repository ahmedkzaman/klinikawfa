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
