import { beforeEach, describe, expect, it, vi } from 'vitest';

const useQuery = vi.hoisted(() => vi.fn());
const rpc = vi.hoisted(() => vi.fn());

vi.mock('@tanstack/react-query', () => ({ useQuery }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc } }));

import { useDoctorClinicalActivity } from '@/hooks/clinic/useDoctorClinicalActivity';

const dates = [new Date('2026-07-01T12:00:00'), new Date('2026-07-31T12:00:00')] as const;

const rpcRow = (overrides = {}) => ({
  activity_id: 'activity-1',
  activity_kind: 'procedure',
  activity_date: '2026-07-16T09:00:00.000Z',
  activity_name: 'Nebulisation',
  consultation_id: 'consultation-1',
  queue_entry_id: 'queue-entry-1',
  queue_created_at: '2026-07-16T08:30:00.000Z',
  queue_sequence: 4,
  doctor_id: 'doctor-1',
  doctor_name: 'Dr A',
  patient_name: 'Patient One',
  ...overrides,
});

describe('useDoctorClinicalActivity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useQuery.mockImplementation((options) => options);
  });

  it('calls the typed RPC with date keys and maps its snake_case row before aggregation', async () => {
    rpc.mockResolvedValue({ data: [rpcRow()], error: null });

    const { queryKey, queryFn } = useDoctorClinicalActivity(...dates) as unknown as {
      queryKey: unknown[];
      queryFn: () => Promise<unknown>;
    };

    await expect(queryFn()).resolves.toEqual([expect.objectContaining({
      doctorId: 'doctor-1',
      doctorName: 'Dr A',
      procedures: 1,
      rows: [expect.objectContaining({
        activityId: 'activity-1',
        activityKind: 'procedure',
        activityDate: '2026-07-16T09:00:00.000Z',
        activityName: 'Nebulisation',
        consultationId: 'consultation-1',
        queueEntryId: 'queue-entry-1',
        queueCreatedAt: '2026-07-16T08:30:00.000Z',
        queueSequence: 4,
        patientName: 'Patient One',
      })],
    })]);
    expect(queryKey).toEqual(['doctor-clinical-activity', '2026-07-01', '2026-07-31']);
    expect(rpc).toHaveBeenCalledWith('get_doctor_clinical_activity', {
      _start_date: '2026-07-01',
      _end_date: '2026-07-31',
    });
  });

  it('rejects an RPC error unchanged', async () => {
    const error = new Error('RPC unavailable');
    rpc.mockResolvedValue({ data: null, error });

    const { queryFn } = useDoctorClinicalActivity(...dates) as unknown as {
      queryFn: () => Promise<unknown>;
    };

    await expect(queryFn()).rejects.toBe(error);
  });

  it('returns no summaries for an empty RPC response', async () => {
    rpc.mockResolvedValue({ data: [], error: null });

    const { queryFn } = useDoctorClinicalActivity(...dates) as unknown as {
      queryFn: () => Promise<unknown>;
    };

    await expect(queryFn()).resolves.toEqual([]);
  });

  it('excludes unknown activity kinds from aggregation', async () => {
    rpc.mockResolvedValue({ data: [rpcRow({ activity_kind: 'other' })], error: null });

    const { queryFn } = useDoctorClinicalActivity(...dates) as unknown as {
      queryFn: () => Promise<unknown>;
    };

    await expect(queryFn()).resolves.toEqual([]);
  });
});
