import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { PropsWithChildren } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useDeleteAttachment } from '@/hooks/clinic/useAttachments';

const mocks = vi.hoisted(() => {
  const events: string[] = [];
  const eq = vi.fn(async () => {
    events.push('metadata-delete');
    return { error: null };
  });
  const remove = vi.fn(async () => {
    events.push('storage-delete');
    return { error: null };
  });
  const rpc = vi.fn(async () => {
    events.push('offline-delete-rpc');
    return { data: 'consultation-1/file.pdf', error: null };
  });
  return {
    events,
    eq,
    remove,
    rpc,
    from: vi.fn(() => ({ delete: () => ({ eq }) })),
    storageFrom: vi.fn(() => ({ remove })),
  };
});

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: mocks.rpc,
    from: mocks.from,
    storage: { from: mocks.storageFrom },
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

const attachment = {
  id: 'attachment-1',
  consultation_id: 'consultation-1',
  file_path: 'consultation-1/file.pdf',
};

describe('offline attachment deletion ordering', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.events.length = 0;
  });

  it('deletes offline metadata authoritatively before touching Storage', async () => {
    const { result } = renderHook(
      () => useDeleteAttachment({ offlineConsultationId: 'consultation-1' }),
      { wrapper },
    );

    await act(async () => result.current.mutateAsync(attachment));

    expect(mocks.rpc).toHaveBeenCalledWith('delete_offline_consultation_attachment', {
      p_attachment_id: 'attachment-1',
      p_consultation_id: 'consultation-1',
    });
    expect(mocks.events).toEqual(['offline-delete-rpc', 'storage-delete']);
    expect(mocks.remove).toHaveBeenCalledWith(['consultation-1/file.pdf']);
  });

  it('preserves the existing Storage-first behavior for live consultations', async () => {
    const { result } = renderHook(() => useDeleteAttachment(), { wrapper });

    await act(async () => result.current.mutateAsync(attachment));

    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.events).toEqual(['storage-delete', 'metadata-delete']);
  });
});
