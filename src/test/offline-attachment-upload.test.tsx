import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { PropsWithChildren } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useUploadAttachment } from '@/hooks/clinic/useAttachments';

const test = vi.hoisted(() => {
  const events: string[] = [];
  const upload = vi.fn(async () => {
    events.push('storage-upload');
    return { error: null };
  });
  const remove = vi.fn(async () => {
    events.push('storage-remove');
    return { error: null };
  });
  const single = vi.fn(async () => {
    events.push('metadata-insert');
    return {
      data: {
        id: 'attachment-live',
        consultation_id: 'consultation-1',
        file_path: 'consultation-1/live.pdf',
      },
      error: null,
    };
  });
  const select = vi.fn(() => ({ single }));
  const insert = vi.fn(() => ({ select }));
  const from = vi.fn(() => ({ insert }));
  const storageFrom = vi.fn(() => ({ upload, remove }));
  const getUser = vi.fn(async () => ({ data: { user: { id: 'ops-1' } } }));
  const rpc = vi.fn(async (name: string) => {
    events.push(name);
    if (name === 'reserve_offline_consultation_attachment') {
      return {
        data: [{
          reservation_id: 'reservation-1',
          file_path: 'consultation-1/offline-reservations/reservation-1',
          expires_at: '2026-08-03T12:15:00.000Z',
        }],
        error: null,
      };
    }
    if (name === 'finalize_offline_consultation_attachment') {
      return {
        data: {
          id: 'attachment-offline',
          consultation_id: 'consultation-1',
          file_path: 'consultation-1/offline-reservations/reservation-1',
        },
        error: null,
      };
    }
    if (name === 'cancel_offline_consultation_attachment_upload') {
      return {
        data: [{
          status: 'cancelled',
          file_path: 'consultation-1/offline-reservations/reservation-1',
          attachment_id: null,
        }],
        error: null,
      };
    }
    return { data: null, error: new Error(`Unexpected RPC ${name}`) };
  });
  return {
    events,
    upload,
    remove,
    single,
    select,
    insert,
    from,
    storageFrom,
    getUser,
    rpc,
  };
});

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: test.rpc,
    from: test.from,
    storage: { from: test.storageFrom },
    auth: { getUser: test.getUser },
  },
}));

function wrapper({ children }: PropsWithChildren) {
  return (
    <QueryClientProvider client={new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })}>
      {children}
    </QueryClientProvider>
  );
}

function clinicalFile() {
  return new File(['offline note'], 'outage-note.pdf', { type: 'application/pdf' });
}

describe('offline attachment upload reservation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    test.events.length = 0;
    test.upload.mockImplementation(async () => {
      test.events.push('storage-upload');
      return { error: null };
    });
    test.remove.mockImplementation(async () => {
      test.events.push('storage-remove');
      return { error: null };
    });
    test.rpc.mockImplementation(async (name: string) => {
      test.events.push(name);
      if (name === 'reserve_offline_consultation_attachment') {
        return {
          data: [{
            reservation_id: 'reservation-1',
            file_path: 'consultation-1/offline-reservations/reservation-1',
            expires_at: '2026-08-03T12:15:00.000Z',
          }],
          error: null,
        };
      }
      if (name === 'finalize_offline_consultation_attachment') {
        return {
          data: {
            id: 'attachment-offline',
            consultation_id: 'consultation-1',
            file_path: 'consultation-1/offline-reservations/reservation-1',
          },
          error: null,
        };
      }
      if (name === 'cancel_offline_consultation_attachment_upload') {
        return {
          data: [{
            status: 'cancelled',
            file_path: 'consultation-1/offline-reservations/reservation-1',
            attachment_id: null,
          }],
          error: null,
        };
      }
      return { data: null, error: new Error(`Unexpected RPC ${name}`) };
    });
  });

  it('reserves before Storage and finalizes metadata after upload', async () => {
    const { result } = renderHook(
      () => useUploadAttachment('consultation-1', {
        offlineConsultationId: 'consultation-1',
      }),
      { wrapper },
    );

    await act(async () => result.current.mutateAsync({
      file: clinicalFile(),
      remark: 'Captured during outage',
    }));

    expect(test.events).toEqual([
      'reserve_offline_consultation_attachment',
      'storage-upload',
      'finalize_offline_consultation_attachment',
    ]);
    expect(test.upload).toHaveBeenCalledWith(
      'consultation-1/offline-reservations/reservation-1',
      expect.any(File),
      expect.objectContaining({ contentType: 'application/pdf', upsert: false }),
    );
    expect(test.rpc).toHaveBeenNthCalledWith(1, 'reserve_offline_consultation_attachment', {
      p_consultation_id: 'consultation-1',
      p_file_name: 'outage-note.pdf',
      p_content_type: 'application/pdf',
      p_file_size: 12,
      p_remark: 'Captured during outage',
    });
    expect(test.rpc).toHaveBeenNthCalledWith(2, 'finalize_offline_consultation_attachment', {
      p_reservation_id: 'reservation-1',
    });
    expect(test.from).not.toHaveBeenCalled();
    expect(test.getUser).not.toHaveBeenCalled();
  });

  it('preserves the existing direct metadata flow for live consultations', async () => {
    const { result } = renderHook(() => useUploadAttachment('consultation-1'), { wrapper });

    await act(async () => result.current.mutateAsync(clinicalFile()));

    expect(test.rpc).not.toHaveBeenCalled();
    expect(test.events).toEqual(['storage-upload', 'metadata-insert']);
    expect(test.insert).toHaveBeenCalled();
  });

  it('does not delete an object when cleanup resolution says finalization committed', async () => {
    let cancelCalls = 0;
    test.rpc.mockImplementation(async (name: string) => {
      test.events.push(name);
      if (name === 'reserve_offline_consultation_attachment') {
        return {
          data: [{
            reservation_id: 'reservation-1',
            file_path: 'consultation-1/offline-reservations/reservation-1',
            expires_at: '2026-08-03T12:15:00.000Z',
          }],
          error: null,
        };
      }
      if (name === 'finalize_offline_consultation_attachment') {
        return { data: null, error: new Error('response lost') };
      }
      if (name === 'cancel_offline_consultation_attachment_upload') {
        cancelCalls += 1;
        return {
          data: [{
            status: 'finalized',
            file_path: 'consultation-1/offline-reservations/reservation-1',
            attachment_id: 'attachment-offline',
          }],
          error: null,
        };
      }
      return { data: null, error: new Error(`Unexpected RPC ${name}`) };
    });
    const { result } = renderHook(
      () => useUploadAttachment('consultation-1', {
        offlineConsultationId: 'consultation-1',
      }),
      { wrapper },
    );

    let uploaded: unknown;
    await act(async () => {
      uploaded = await result.current.mutateAsync(clinicalFile());
    });

    expect(cancelCalls).toBe(1);
    expect(uploaded).toEqual(expect.objectContaining({ id: 'attachment-offline' }));
    expect(test.remove).not.toHaveBeenCalled();
  });

  it('marks an unfinalized object collectable before removal and closes cleanup after removal', async () => {
    let cancelCalls = 0;
    test.rpc.mockImplementation(async (name: string) => {
      test.events.push(name);
      if (name === 'reserve_offline_consultation_attachment') {
        return {
          data: [{
            reservation_id: 'reservation-1',
            file_path: 'consultation-1/offline-reservations/reservation-1',
            expires_at: '2026-08-03T12:15:00.000Z',
          }],
          error: null,
        };
      }
      if (name === 'finalize_offline_consultation_attachment') {
        return { data: null, error: new Error('metadata rejected') };
      }
      if (name === 'cancel_offline_consultation_attachment_upload') {
        cancelCalls += 1;
        return {
          data: [{
            status: cancelCalls === 1 ? 'cleanup_required' : 'cancelled',
            file_path: 'consultation-1/offline-reservations/reservation-1',
            attachment_id: null,
          }],
          error: null,
        };
      }
      return { data: null, error: new Error(`Unexpected RPC ${name}`) };
    });
    const { result } = renderHook(
      () => useUploadAttachment('consultation-1', {
        offlineConsultationId: 'consultation-1',
      }),
      { wrapper },
    );

    let uploadError: unknown;
    await act(async () => {
      try {
        await result.current.mutateAsync(clinicalFile());
      } catch (error) {
        uploadError = error;
      }
    });

    expect(uploadError).toEqual(expect.objectContaining({ message: 'metadata rejected' }));

    expect(test.events).toEqual([
      'reserve_offline_consultation_attachment',
      'storage-upload',
      'finalize_offline_consultation_attachment',
      'cancel_offline_consultation_attachment_upload',
      'storage-remove',
      'cancel_offline_consultation_attachment_upload',
    ]);
    expect(test.remove).toHaveBeenCalledWith([
      'consultation-1/offline-reservations/reservation-1',
    ]);
  });
});
