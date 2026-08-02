import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { PropsWithChildren } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useConsultation } from '@/hooks/clinic/useConsultations';
import {
  useOfflineConsultationAudit,
  useReviewOfflineConsultation,
  useSaveOfflineConsultation,
} from '@/hooks/clinic/useOfflineConsultationApproval';

const { rpc, from, select, eq, is, maybeSingle } = vi.hoisted(() => {
  const maybeSingle = vi.fn();
  const is = vi.fn(() => ({ maybeSingle }));
  const eq = vi.fn(() => ({ is }));
  const select = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ select }));
  return { rpc: vi.fn(), from, select, eq, is, maybeSingle };
});

vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc, from } }));

const savedConsultation = {
  id: 'consultation-1',
  queue_entry_id: 'queue-1',
  patient_id: 'patient-1',
  doctor_id: 'doctor-1',
  entry_source: 'offline_transcription',
  approval_status: 'pending',
  approval_revision: 0,
};

function createQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

function createWrapper(queryClient: QueryClient) {
  return function QueryWrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

describe('offline consultation approval hooks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rpc.mockResolvedValue({ data: savedConsultation, error: null });
    maybeSingle.mockResolvedValue({ data: savedConsultation, error: null });
  });

  it('saves through the guarded RPC without client-supplied actor fields', async () => {
    const queryClient = createQueryClient();
    const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useSaveOfflineConsultation(), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      await result.current.mutateAsync({
        queueEntryId: 'queue-1',
        doctorId: 'doctor-1',
        originalConsultedAt: '2026-08-02T10:00:00.000Z',
        caseNote: 'Recorded after an outage.',
        diagnosisId: null,
        diagnosisText: 'Viral illness',
        dispenseNote: 'Hydration advice',
        expectedRevision: 0,
      });
    });

    expect(rpc).toHaveBeenCalledWith('save_offline_consultation', {
      p_queue_entry_id: 'queue-1',
      p_doctor_id: 'doctor-1',
      p_original_consulted_at: '2026-08-02T10:00:00.000Z',
      p_case_note: 'Recorded after an outage.',
      p_diagnosis_id: null,
      p_diagnosis_text: 'Viral illness',
      p_dispense_note: 'Hydration advice',
      p_expected_revision: 0,
    });
    const [, payload] = rpc.mock.calls[0];
    expect(payload).not.toHaveProperty('entered_by');
    expect(payload).not.toHaveProperty('approved_by');
    expect(payload).not.toHaveProperty('returned_by');
    expect(invalidateQueries.mock.calls.map(([filters]) => filters.queryKey)).toEqual([
      ['consultation', 'queue-1'],
      ['consultation_history'],
      ['offline_consultation_audit', 'consultation-1'],
    ]);
  });

  it('reviews through the guarded RPC and refreshes consultation and audit state', async () => {
    const queryClient = createQueryClient();
    const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useReviewOfflineConsultation(), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      await result.current.mutateAsync({
        consultationId: 'consultation-1',
        action: 'return',
        reason: 'Please clarify the diagnosis.',
        expectedRevision: 0,
      });
    });

    expect(rpc).toHaveBeenCalledWith('review_offline_consultation', {
      p_consultation_id: 'consultation-1',
      p_action: 'return',
      p_reason: 'Please clarify the diagnosis.',
      p_expected_revision: 0,
    });
    const [, payload] = rpc.mock.calls[0];
    expect(payload).not.toHaveProperty('entered_by');
    expect(payload).not.toHaveProperty('approved_by');
    expect(payload).not.toHaveProperty('returned_by');
    expect(invalidateQueries.mock.calls.map(([filters]) => filters.queryKey)).toEqual([
      ['consultation', 'queue-1'],
      ['consultation_history'],
      ['offline_consultation_audit', 'consultation-1'],
    ]);
  });

  it('propagates RPC errors without marking stale cache data as successful', async () => {
    const error = new Error('offline_consultation_not_editable');
    rpc.mockResolvedValueOnce({ data: null, error });
    const queryClient = createQueryClient();
    const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useSaveOfflineConsultation(), {
      wrapper: createWrapper(queryClient),
    });

    await expect(
      result.current.mutateAsync({
        queueEntryId: 'queue-1',
        doctorId: 'doctor-1',
        originalConsultedAt: '2026-08-02T10:00:00.000Z',
        caseNote: '',
        diagnosisId: null,
        diagnosisText: '',
        dispenseNote: '',
        expectedRevision: 0,
      }),
    ).rejects.toBe(error);
    expect(invalidateQueries).not.toHaveBeenCalled();
  });

  it('reads the server-authored audit without exposing audit snapshots', async () => {
    rpc.mockResolvedValueOnce({
      data: [
        {
          id: 'audit-1',
          action: 'submitted',
          actor_id: 'staff-1',
          actor_name: 'Staff One',
          created_at: '2026-08-02T10:05:00.000Z',
          reason: null,
        },
      ],
      error: null,
    });
    const queryClient = createQueryClient();
    const { result } = renderHook(() => useOfflineConsultationAudit('consultation-1'), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => expect(result.current.data).toHaveLength(1));
    expect(rpc).toHaveBeenCalledWith('get_offline_consultation_audit', {
      p_consultation_id: 'consultation-1',
    });
    expect(result.current.data?.[0]).not.toHaveProperty('snapshot');
  });

  it('selects offline provenance fields with a consultation record', async () => {
    const queryClient = createQueryClient();
    renderHook(() => useConsultation('queue-1'), { wrapper: createWrapper(queryClient) });

    await waitFor(() => expect(select).toHaveBeenCalled());
    expect(select).toHaveBeenCalledWith(
      expect.stringContaining('entry_source, entered_by, original_consulted_at'),
    );
    expect(select).toHaveBeenCalledWith(
      expect.stringContaining('approval_status, approved_by, approved_at'),
    );
    expect(select).toHaveBeenCalledWith(
      expect.stringContaining('returned_by, returned_at, return_reason, approval_revision'),
    );
  });
});
