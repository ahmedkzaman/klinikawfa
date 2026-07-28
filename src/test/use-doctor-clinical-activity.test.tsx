import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { PropsWithChildren } from 'react';

const useQuery = vi.hoisted(() => vi.fn());
const rpc = vi.hoisted(() => vi.fn());

vi.mock('@tanstack/react-query', async () => ({
  ...(await vi.importActual<typeof import('@tanstack/react-query')>('@tanstack/react-query')),
  useQuery,
}));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc } }));

import { useDoctorClinicalActivity } from '@/hooks/clinic/useDoctorClinicalActivity';

const { useQuery: realUseQuery } = await vi.importActual<typeof import('@tanstack/react-query')>(
  '@tanstack/react-query',
);

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
    const range = vi.fn().mockResolvedValue({ data: [rpcRow()], error: null });
    rpc.mockReturnValue({ range });

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
    expect(range).toHaveBeenCalledWith(0, 999);
  });

  it('rejects an RPC error unchanged', async () => {
    const error = new Error('RPC unavailable');
    rpc.mockReturnValue({ range: vi.fn().mockResolvedValue({ data: null, error }) });

    const { queryFn } = useDoctorClinicalActivity(...dates) as unknown as {
      queryFn: () => Promise<unknown>;
    };

    await expect(queryFn()).rejects.toBe(error);
  });

  it('exposes an RPC failure through the React Query error state', async () => {
    const error = new Error('RPC unavailable');
    rpc.mockReturnValue({ range: vi.fn().mockResolvedValue({ data: null, error }) });
    useQuery.mockImplementation(realUseQuery);
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const wrapper = ({ children }: PropsWithChildren) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(() => useDoctorClinicalActivity(...dates), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBe(error);
  });

  it('returns no summaries for an empty RPC response', async () => {
    rpc.mockReturnValue({ range: vi.fn().mockResolvedValue({ data: [], error: null }) });

    const { queryFn } = useDoctorClinicalActivity(...dates) as unknown as {
      queryFn: () => Promise<unknown>;
    };

    await expect(queryFn()).resolves.toEqual([]);
  });

  it('excludes unknown activity kinds from aggregation', async () => {
    rpc.mockReturnValue({
      range: vi.fn().mockResolvedValue({ data: [rpcRow({ activity_kind: 'other' })], error: null }),
    });

    const { queryFn } = useDoctorClinicalActivity(...dates) as unknown as {
      queryFn: () => Promise<unknown>;
    };

    await expect(queryFn()).resolves.toEqual([]);
  });

  it('loads all RPC pages before aggregating more than 1,000 rows', async () => {
    const rows = Array.from({ length: 1_001 }, (_, index) => rpcRow({
      activity_id: `activity-${index}`,
      activity_kind: index === 1_000 ? 'mc' : 'procedure',
      activity_name: index === 1_000 ? 'Medical certificate' : `Procedure ${index}`,
      queue_sequence: index + 1,
    }));
    const range = vi.fn((from: number, to: number) => Promise.resolve({
      data: rows.slice(from, to + 1),
      error: null,
    }));
    rpc.mockReturnValue({ range });

    const { queryFn } = useDoctorClinicalActivity(...dates) as unknown as {
      queryFn: () => Promise<Array<{ rows: unknown[] }>>;
    };

    const result = await queryFn();
    expect(result).toEqual([
      expect.objectContaining({
        doctorId: 'doctor-1',
        procedures: 1_000,
        mc: 1,
        totalDocuments: 1,
        rows: expect.arrayContaining([
          expect.objectContaining({ activityId: 'activity-999', activityName: 'Procedure 999' }),
          expect.objectContaining({ activityId: 'activity-1000', activityName: 'Medical certificate' }),
        ]),
      }),
    ]);
    expect(result[0].rows).toHaveLength(1_001);
    expect(range).toHaveBeenCalledWith(0, 999);
    expect(range).toHaveBeenCalledWith(1_000, 1_999);
  });

  it('preserves a nullable queue sequence instead of coercing it to zero', async () => {
    rpc.mockReturnValue({
      range: vi.fn().mockResolvedValue({
        data: [rpcRow({ queue_sequence: null })],
        error: null,
      }),
    });

    const { queryFn } = useDoctorClinicalActivity(...dates) as unknown as {
      queryFn: () => Promise<unknown>;
    };

    await expect(queryFn()).resolves.toEqual([
      expect.objectContaining({
        rows: [expect.objectContaining({ queueSequence: null })],
      }),
    ]);
  });
});
