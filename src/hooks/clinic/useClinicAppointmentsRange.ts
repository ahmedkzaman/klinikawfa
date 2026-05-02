import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface ClinicAppointmentRange {
  id: string;
  patient_id: string;
  doctor_id: string | null;
  appointment_date: string;
  appointment_time: string;
  status: string;
  notes: string | null;
  patients: { id: string; name: string; phone: string | null } | null;
  doctors: { id: string; name: string } | null;
}

const KEY = ['clinic', 'clinic_appointments', 'range'] as const;

/**
 * Range query for the calendar. Inclusive of both bounds (YYYY-MM-DD).
 */
export function useClinicAppointmentsRange(fromDate: string, toDate: string) {
  return useQuery<ClinicAppointmentRange[]>({
    queryKey: [...KEY, fromDate, toDate],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('clinic_appointments')
        .select(
          'id, patient_id, doctor_id, appointment_date, appointment_time, status, notes, patients:patient_id(id, name, phone), doctors:doctor_id(id, name)',
        )
        .gte('appointment_date', fromDate)
        .lte('appointment_date', toDate)
        .order('appointment_date', { ascending: true })
        .order('appointment_time', { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as ClinicAppointmentRange[];
    },
    staleTime: 30_000,
  });
}

export function useUpdateClinicAppointment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      ...patch
    }: {
      id: string;
      status?: string;
      notes?: string | null;
      appointment_date?: string;
      appointment_time?: string;
      doctor_id?: string | null;
    }) => {
      const { error } = await supabase
        .from('clinic_appointments')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .update(patch as any)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['clinic', 'clinic_appointments'] });
    },
  });
}
