import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import type { PropsWithChildren } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useConsultation } from '@/hooks/clinic/useConsultations';
import {
  useOfflineConsultationAudit,
  useOfflineConsultationEntryVisits,
  useReviewOfflineConsultation,
  useSaveOfflineConsultation,
} from '@/hooks/clinic/useOfflineConsultationApproval';

const { supabaseClient, rpc, from, select, eq, is, maybeSingle } = vi.hoisted(() => {
  const maybeSingle = vi.fn();
  const is = vi.fn(() => ({ maybeSingle }));
  const eq = vi.fn(() => ({ is }));
  const select = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ select }));
  const rpc = vi.fn();
  return {
    supabaseClient: { rpc, from },
    rpc,
    from,
    select,
    eq,
    is,
    maybeSingle,
  };
});

vi.mock('@/integrations/supabase/client', () => ({ supabase: supabaseClient }));

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
        expectedRevision: null,
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
      p_expected_revision: null,
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

  it('defensively keeps only the latest 50 projected audit fields', async () => {
    rpc.mockResolvedValueOnce({
      data: Array.from({ length: 55 }, (_, index) => {
        const eventNumber = index + 1;
        return {
          id: `audit-${eventNumber}`,
          action: 'submitted',
          actor_id: 'staff-1',
          actor_name: 'Staff One',
          created_at: new Date(Date.UTC(2026, 7, 2, 10, eventNumber)).toISOString(),
          reason: null,
          snapshot: { case_note: `private snapshot ${eventNumber}` },
        };
      }),
      error: null,
    });
    const queryClient = createQueryClient();
    const { result } = renderHook(() => useOfflineConsultationAudit('consultation-1'), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => expect(result.current.data).toHaveLength(50));
    expect(rpc).toHaveBeenCalledWith('get_offline_consultation_audit', {
      p_consultation_id: 'consultation-1',
    });
    expect(result.current.data?.[0].id).toBe('audit-6');
    expect(result.current.data?.at(-1)?.id).toBe('audit-55');
    expect(result.current.data?.[0]).not.toHaveProperty('snapshot');
  });

  it('keeps the Supabase client receiver when loading operations offline visits', async () => {
    rpc.mockImplementation(function (this: unknown, name: string) {
      if (this !== supabaseClient) {
        throw new TypeError("Cannot read properties of undefined (reading 'rest')");
      }
      if (name !== 'list_offline_consultation_entry_visits') {
        return Promise.resolve({ data: null, error: new Error(`Unexpected RPC: ${name}`) });
      }
      return Promise.resolve({ data: [{ queue_entry_id: 'queue-1' }], error: null });
    });
    const queryClient = createQueryClient();
    const { result } = renderHook(
      () => useOfflineConsultationEntryVisits(
        '2026-08-05T00:00:00.000Z',
        '2026-08-06T00:00:00.000Z',
        true,
      ),
      { wrapper: createWrapper(queryClient) },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect([...result.current.data!]).toEqual(['queue-1']);
  });

  it('synchronizes active consultation, history, and audit queries after a real review mutation', async () => {
    let consultationState = { ...savedConsultation };
    let historyState = [{
      id: savedConsultation.id,
      approval_status: savedConsultation.approval_status,
      approval_revision: savedConsultation.approval_revision,
    }];
    let auditState = [{
      id: 'audit-submitted',
      action: 'submitted',
      actor_id: 'staff-1',
      actor_name: 'Staff One',
      created_at: '2026-08-02T10:00:00.000Z',
      reason: null,
    }];
    const fetchHistory = vi.fn(async () => historyState);

    maybeSingle.mockImplementation(async () => ({ data: consultationState, error: null }));
    rpc.mockImplementation(async (name: string) => {
      if (name === 'get_offline_consultation_audit') {
        return { data: auditState, error: null };
      }
      if (name === 'review_offline_consultation') {
        consultationState = {
          ...consultationState,
          approval_status: 'approved',
          approval_revision: 1,
        };
        historyState = [{
          id: consultationState.id,
          approval_status: consultationState.approval_status,
          approval_revision: consultationState.approval_revision,
        }];
        auditState = [
          ...auditState,
          {
            id: 'audit-approved',
            action: 'approved',
            actor_id: 'doctor-1',
            actor_name: 'Doctor One',
            created_at: '2026-08-02T10:05:00.000Z',
            reason: null,
          },
        ];
        return { data: consultationState, error: null };
      }
      return { data: null, error: new Error(`Unexpected RPC: ${name}`) };
    });

    const queryClient = createQueryClient();
    const { result } = renderHook(() => ({
      consultation: useConsultation('queue-1'),
      history: useQuery({
        queryKey: ['consultation_history', 'patient-1'],
        queryFn: fetchHistory,
      }),
      audit: useOfflineConsultationAudit('consultation-1'),
      review: useReviewOfflineConsultation(),
    }), { wrapper: createWrapper(queryClient) });

    await waitFor(() => {
      expect(result.current.consultation.data?.approval_status).toBe('pending');
      expect(result.current.history.data?.[0].approval_status).toBe('pending');
      expect(result.current.audit.data?.at(-1)?.action).toBe('submitted');
    });

    await act(async () => {
      await result.current.review.mutateAsync({
        consultationId: 'consultation-1',
        action: 'approve',
        expectedRevision: 0,
      });
    });

    await waitFor(() => {
      expect(result.current.consultation.data?.approval_status).toBe('approved');
      expect(result.current.consultation.data?.approval_revision).toBe(1);
      expect(result.current.history.data?.[0].approval_status).toBe('approved');
      expect(result.current.history.data?.[0].approval_revision).toBe(1);
      expect(result.current.audit.data?.at(-1)?.action).toBe('approved');
    });

    expect(maybeSingle).toHaveBeenCalledTimes(2);
    expect(fetchHistory).toHaveBeenCalledTimes(2);
    expect(rpc.mock.calls.filter(([name]) => name === 'get_offline_consultation_audit')).toHaveLength(2);
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
