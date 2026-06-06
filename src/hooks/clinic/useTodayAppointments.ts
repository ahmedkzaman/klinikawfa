import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { AppointmentRow } from '@/types/clinic';

/**
 * Today's appointments with status='pending' — feeds the
 * "Check In Appointment" picker on the queue board.
 */
export function useTodayAppointments() {
  return useQuery<AppointmentRow[]>({
    queryKey: ['clinic', 'today-appointments'],
    queryFn: async () => {
      const today = new Date();
      const yyyy = today.getFullYear();
      const mm = String(today.getMonth() + 1).padStart(2, '0');
      const dd = String(today.getDate()).padStart(2, '0');
      const todayStr = `${yyyy}-${mm}-${dd}`;

      const { data, error } = await supabase
        .from('appointments')
        .select('*')
        .eq('appointment_date', todayStr)
        .eq('status', 'pending')
        .order('appointment_time', { ascending: true });

      if (error) throw error;
      return data ?? [];
    },
    staleTime: 30_000,
  });
}
