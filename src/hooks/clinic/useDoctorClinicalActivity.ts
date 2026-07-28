import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import {
  aggregateDoctorClinicalActivity,
  type DoctorActivityKind,
  type DoctorActivityRow,
  type DoctorActivitySummary,
} from '@/lib/clinic/doctorClinicalActivity';
import type { Database } from '@/integrations/supabase/types';

type DoctorClinicalActivityRpcRow = Database['public']['Functions']['get_doctor_clinical_activity']['Returns'][number];

const activityKinds: readonly DoctorActivityKind[] = [
  'procedure',
  'mc',
  'quarantine',
  'referral',
];

function isDoctorActivityKind(value: string): value is DoctorActivityKind {
  return activityKinds.includes(value as DoctorActivityKind);
}

function mapDoctorActivityRow(row: DoctorClinicalActivityRpcRow): DoctorActivityRow | null {
  if (!isDoctorActivityKind(row.activity_kind)) return null;

  return {
    activityId: row.activity_id,
    activityKind: row.activity_kind,
    activityDate: row.activity_date,
    activityName: row.activity_name,
    consultationId: row.consultation_id,
    queueEntryId: row.queue_entry_id,
    queueCreatedAt: row.queue_created_at,
    queueSequence: row.queue_sequence ?? 0,
    doctorId: row.doctor_id,
    doctorName: row.doctor_name,
    patientName: row.patient_name,
  };
}

export function useDoctorClinicalActivity(
  startDate: Date,
  endDate: Date,
): UseQueryResult<DoctorActivitySummary[], Error> {
  const startKey = format(startDate, 'yyyy-MM-dd');
  const endKey = format(endDate, 'yyyy-MM-dd');

  return useQuery<DoctorActivitySummary[], Error>({
    queryKey: ['doctor-clinical-activity', startKey, endKey],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_doctor_clinical_activity', {
        _start_date: startKey,
        _end_date: endKey,
      });
      if (error) throw error;

      return aggregateDoctorClinicalActivity(
        (data ?? [])
          .map(mapDoctorActivityRow)
          .filter((row): row is DoctorActivityRow => row !== null),
      );
    },
  });
}
