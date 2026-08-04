import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { readFileSync } from 'node:fs';
import type { PropsWithChildren } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IssueDocumentModal } from '@/components/clinic/consultation/IssueDocumentModal';
import {
  useAddConsultationDocument,
  useDeleteConsultationDocument,
} from '@/hooks/clinic/useClinicDocuments';
import type { ConsultationDocument, DocumentTemplate } from '@/hooks/clinic/useClinicDocuments';

const { directInsert, directDelete, directUpdate, from, rpc } = vi.hoisted(() => {
  const directInsert = vi.fn();
  const directDelete = vi.fn();
  const directUpdate = vi.fn();
  const from = vi.fn(() => ({
    insert: directInsert,
    delete: directDelete,
    update: directUpdate,
  }));
  return { directInsert, directDelete, directUpdate, from, rpc: vi.fn() };
});

vi.mock('@/integrations/supabase/client', () => ({ supabase: { from, rpc } }));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'staff-1' } }),
}));

vi.mock('@/hooks/clinic/useClinicSettings', () => ({
  useClinicSettings: () => ({ settings: { clinic_name: 'Klinik Awfa' } }),
}));

vi.mock('@/hooks/clinic/useCurrentDoctor', () => ({
  useCurrentDoctor: () => ({ data: { name: 'Dr Test' } }),
}));

vi.mock('@/hooks/clinic/useClinicDocumentFees', () => ({
  useClinicDocumentFees: () => ({
    data: [
      { documentType: 'mc', amount: 15 },
      { documentType: 'quarantine', amount: 15 },
    ],
    isLoading: false,
  }),
}));

const template: DocumentTemplate = {
  id: 'template-1',
  name: 'Medical Certificate',
  type: 'mc',
  content: 'Rest for two days.',
  paper_size: 'A4',
  orientation: 'portrait',
  is_active: true,
  created_at: '2026-07-29T00:00:00.000Z',
  updated_at: '2026-07-29T00:00:00.000Z',
};

const existingDocument: ConsultationDocument = {
  id: 'document-1',
  consultation_id: 'consultation-1',
  patient_id: 'patient-1',
  template_id: 'template-1',
  template_name: 'Medical Certificate',
  type: 'mc',
  content: 'Existing content',
  paper_size: 'A4',
  orientation: 'portrait',
  created_by: 'staff-1',
  created_at: '2026-07-29T00:00:00.000Z',
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

function directMutationResult(data: ConsultationDocument) {
  return {
    select: () => ({ single: async () => ({ data, error: null }) }),
    eq: () => ({ select: () => ({ single: async () => ({ data, error: null }) }) }),
  };
}

describe('official documentation document lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    directInsert.mockReturnValue(directMutationResult(existingDocument));
    directUpdate.mockReturnValue(directMutationResult(existingDocument));
    directDelete.mockReturnValue({ eq: async () => ({ error: null }) });
    rpc.mockResolvedValue({ data: existingDocument, error: null });
  });

  it('issues a supported document through the guarded fee RPC with the caller document ID', async () => {
    const queryClient = createQueryClient();
    const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useAddConsultationDocument(), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      await result.current.mutateAsync({
        id: '11111111-1111-4111-8111-111111111111',
        consultation_id: 'consultation-1',
        patient_id: 'patient-1',
        template_id: 'template-1',
        template_name: 'Medical Certificate',
        type: 'mc',
        content: 'Rest for two days.',
        paper_size: 'A4',
        orientation: 'portrait',
      });
    });

    expect(rpc).toHaveBeenCalledWith('issue_consultation_document_with_fee', {
      _document_id: '11111111-1111-4111-8111-111111111111',
      _consultation_id: 'consultation-1',
      _patient_id: 'patient-1',
      _template_id: 'template-1',
      _template_name: 'Medical Certificate',
      _type: 'mc',
      _content: 'Rest for two days.',
      _paper_size: 'A4',
      _orientation: 'portrait',
    });
    expect(directInsert).not.toHaveBeenCalled();
    expect(invalidateQueries.mock.calls.map(([filters]) => filters.queryKey)).toEqual([
      ['consultation-documents', 'consultation-1'],
      ['consultation_items', 'consultation-1'],
      ['consultation'],
      ['payments'],
      ['payments_ledger'],
      ['clinic', 'queue-entries'],
      ['clinic', 'queue-entry'],
      ['clinic', 'completed-visit-detail'],
      ['patient_outstanding'],
      ['financial-insights'],
      ['sales-insights'],
      ['clinic-health'],
      ['panel_claims'],
      ['panel_claims_summary'],
      ['panel_claim_items'],
      ['ledger_item_totals'],
      ['receipt_payload'],
      ['consultation_history'],
    ]);
  });

  it('voids a document through the guarded fee RPC', async () => {
    const queryClient = createQueryClient();
    const { result } = renderHook(() => useDeleteConsultationDocument(), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      await result.current.mutateAsync({ id: 'document-1', consultation_id: 'consultation-1' });
    });

    expect(rpc).toHaveBeenCalledWith('void_consultation_document_with_fee', {
      _document_id: 'document-1',
    });
    expect(directDelete).not.toHaveBeenCalled();
  });

  it('shows the configured official documentation fee before issuing an MC', () => {
    const queryClient = createQueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <IssueDocumentModal
          isOpen
          onClose={() => undefined}
          template={template}
          patient={{ id: 'patient-1', name: 'Patient Test' }}
          consultationId="consultation-1"
        />
      </QueryClientProvider>,
    );

    expect(screen.getByText('Official Documentation Fees · RM15.00')).toBeInTheDocument();
  });

  it('shows the configured official documentation fee before issuing a quarantine letter', () => {
    const queryClient = createQueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <IssueDocumentModal
          isOpen
          onClose={() => undefined}
          template={{ ...template, id: 'quarantine-template', name: 'Quarantine Letter', type: 'quarantine' }}
          patient={{ id: 'patient-1', name: 'Patient Test' }}
          consultationId="consultation-1"
        />
      </QueryClientProvider>,
    );

    expect(screen.getByText('Official Documentation Fees · RM15.00')).toBeInTheDocument();
  });

  it('keeps edits on the existing update path and explains that the fee is already linked', async () => {
    const queryClient = createQueryClient();
    const onClose = vi.fn();
    render(
      <QueryClientProvider client={queryClient}>
        <IssueDocumentModal
          isOpen
          onClose={onClose}
          template={template}
          existingDoc={existingDocument}
          patient={{ id: 'patient-1', name: 'Patient Test' }}
          consultationId="consultation-1"
        />
      </QueryClientProvider>,
    );

    expect(screen.getByText('Fee already linked — saving changes will not charge it again.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
    await waitFor(() => expect(directUpdate).toHaveBeenCalledWith({ content: 'Existing content' }));
    expect(rpc).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('does not show a fee for unsupported document types', () => {
    const queryClient = createQueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <IssueDocumentModal
          isOpen
          onClose={() => undefined}
          template={{ ...template, id: 'template-2', name: 'Timeslip', type: 'timeslip' }}
          patient={{ id: 'patient-1', name: 'Patient Test' }}
          consultationId="consultation-1"
        />
      </QueryClientProvider>,
    );

    expect(screen.queryByText(/Official Documentation Fees/)).not.toBeInTheDocument();
  });

  it('retries a failed issue with the same caller-supplied document ID', async () => {
    const randomUUID = vi.spyOn(crypto, 'randomUUID')
      .mockReturnValueOnce('attempt-uuid-1')
      .mockReturnValueOnce('attempt-uuid-2');
    rpc
      .mockResolvedValueOnce({ data: null, error: new Error('Request timed out') })
      .mockResolvedValueOnce({ data: existingDocument, error: null });
    const queryClient = createQueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <IssueDocumentModal
          isOpen
          onClose={() => undefined}
          template={template}
          patient={{ id: 'patient-1', name: 'Patient Test' }}
          consultationId="consultation-1"
        />
      </QueryClientProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Save to Consultation' }));
    await waitFor(() => expect(rpc).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: 'Save to Consultation' }));
    await waitFor(() => expect(rpc).toHaveBeenCalledTimes(2));

    expect(rpc.mock.calls.map(([, args]) => args._document_id)).toEqual([
      'attempt-uuid-1',
      'attempt-uuid-1',
    ]);
    randomUUID.mockRestore();
  });

  it('starts a fresh ID after closing and reopening an issue attempt', async () => {
    const randomUUID = vi.spyOn(crypto, 'randomUUID')
      .mockReturnValueOnce('attempt-uuid-1')
      .mockReturnValueOnce('attempt-uuid-2');
    rpc
      .mockResolvedValueOnce({ data: null, error: new Error('Request timed out') })
      .mockResolvedValueOnce({ data: existingDocument, error: null });
    const queryClient = createQueryClient();
    const onClose = vi.fn();
    const { rerender } = render(
      <QueryClientProvider client={queryClient}>
        <IssueDocumentModal
          isOpen
          onClose={onClose}
          template={template}
          patient={{ id: 'patient-1', name: 'Patient Test' }}
          consultationId="consultation-1"
        />
      </QueryClientProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Save to Consultation' }));
    await waitFor(() => expect(rpc).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    rerender(
      <QueryClientProvider client={queryClient}>
        <IssueDocumentModal
          isOpen
          onClose={onClose}
          template={template}
          patient={{ id: 'patient-1', name: 'Patient Test' }}
          consultationId="consultation-1"
        />
      </QueryClientProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Save to Consultation' }));
    await waitFor(() => expect(rpc).toHaveBeenCalledTimes(2));

    expect(rpc.mock.calls.map(([, args]) => args._document_id)).toEqual([
      'attempt-uuid-1',
      'attempt-uuid-2',
    ]);
    randomUUID.mockRestore();
  });

  it('starts a fresh ID after a successful issue closes the attempt', async () => {
    const randomUUID = vi.spyOn(crypto, 'randomUUID')
      .mockReturnValueOnce('attempt-uuid-1')
      .mockReturnValueOnce('attempt-uuid-2');
    rpc.mockResolvedValue({ data: existingDocument, error: null });
    const queryClient = createQueryClient();
    const onClose = vi.fn();
    const { rerender } = render(
      <QueryClientProvider client={queryClient}>
        <IssueDocumentModal
          isOpen
          onClose={onClose}
          template={template}
          patient={{ id: 'patient-1', name: 'Patient Test' }}
          consultationId="consultation-1"
        />
      </QueryClientProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Save to Consultation' }));
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    rerender(
      <QueryClientProvider client={queryClient}>
        <IssueDocumentModal
          isOpen
          onClose={onClose}
          template={template}
          patient={{ id: 'patient-1', name: 'Patient Test' }}
          consultationId="consultation-1"
        />
      </QueryClientProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Save to Consultation' }));
    await waitFor(() => expect(rpc).toHaveBeenCalledTimes(2));

    expect(rpc.mock.calls.map(([, args]) => args._document_id)).toEqual([
      'attempt-uuid-1',
      'attempt-uuid-2',
    ]);
    randomUUID.mockRestore();
  });

  it('starts a fresh ID when the issue attempt context changes', async () => {
    const randomUUID = vi.spyOn(crypto, 'randomUUID')
      .mockReturnValueOnce('attempt-uuid-1')
      .mockReturnValueOnce('attempt-uuid-2');
    rpc
      .mockResolvedValueOnce({ data: null, error: new Error('Request timed out') })
      .mockResolvedValueOnce({ data: existingDocument, error: null });
    const queryClient = createQueryClient();
    const { rerender } = render(
      <QueryClientProvider client={queryClient}>
        <IssueDocumentModal
          isOpen
          onClose={() => undefined}
          template={template}
          patient={{ id: 'patient-1', name: 'Patient Test' }}
          consultationId="consultation-1"
        />
      </QueryClientProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Save to Consultation' }));
    await waitFor(() => expect(rpc).toHaveBeenCalledTimes(1));
    rerender(
      <QueryClientProvider client={queryClient}>
        <IssueDocumentModal
          isOpen
          onClose={() => undefined}
          template={{ ...template, id: 'template-2' }}
          patient={{ id: 'patient-1', name: 'Patient Test' }}
          consultationId="consultation-1"
        />
      </QueryClientProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Save to Consultation' }));
    await waitFor(() => expect(rpc).toHaveBeenCalledTimes(2));

    expect(rpc.mock.calls.map(([, args]) => args._document_id)).toEqual([
      'attempt-uuid-1',
      'attempt-uuid-2',
    ]);
    randomUUID.mockRestore();
  });

  it('does not mutate issue-attempt refs during rendering', () => {
    const source = readFileSync('src/components/clinic/consultation/IssueDocumentModal.tsx', 'utf8');
    const renderPhase = source.slice(0, source.indexOf('const handleSave'));

    expect(renderPhase).not.toMatch(/\.current\s*=/);
  });
});
