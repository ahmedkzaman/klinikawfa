import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export interface DocumentTemplate {
  id: string;
  name: string;
  type: string;
  content: string;
  paper_size: string;
  orientation: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ConsultationDocument {
  id: string;
  consultation_id: string;
  patient_id: string;
  template_id: string | null;
  template_name: string;
  type: string | null;
  content: string;
  paper_size: string;
  orientation: string;
  created_by: string | null;
  created_at: string;
}

type IssueConsultationDocumentInput = {
  id: string;
  consultation_id: string;
  patient_id: string;
  template_id?: string | null;
  template_name: string;
  type?: string | null;
  content: string;
  paper_size: string;
  orientation: string;
};

type ConsultationDocumentFeeDatabase = {
  rpc(
    functionName: 'issue_consultation_document_with_fee',
    args: {
      _document_id: string;
      _consultation_id: string;
      _patient_id: string;
      _template_id: string | null;
      _template_name: string;
      _type: string | null;
      _content: string;
      _paper_size: string;
      _orientation: string;
    },
  ): Promise<{ data: ConsultationDocument | null; error: Error | null }>;
  rpc(
    functionName: 'void_consultation_document_with_fee',
    args: { _document_id: string },
  ): Promise<{ data: null; error: Error | null }>;
};

const consultationDocumentFeeDatabase = supabase as unknown as ConsultationDocumentFeeDatabase;

function invalidateDocumentBillingQueries(qc: ReturnType<typeof useQueryClient>, consultationId: string) {
  qc.invalidateQueries({ queryKey: ['consultation-documents', consultationId] });
  qc.invalidateQueries({ queryKey: ['consultation_items', consultationId] });
  qc.invalidateQueries({ queryKey: ['consultation'] });
  qc.invalidateQueries({ queryKey: ['payments'] });
  qc.invalidateQueries({ queryKey: ['payments_ledger'] });
  qc.invalidateQueries({ queryKey: ['clinic', 'queue-entries'] });
  qc.invalidateQueries({ queryKey: ['clinic', 'queue-entry'] });
  qc.invalidateQueries({ queryKey: ['clinic', 'completed-visit-detail'] });
  qc.invalidateQueries({ queryKey: ['financial-insights'] });
  qc.invalidateQueries({ queryKey: ['sales-insights'] });
  qc.invalidateQueries({ queryKey: ['clinic-health'] });
  qc.invalidateQueries({ queryKey: ['panel_claims'] });
  qc.invalidateQueries({ queryKey: ['panel_claims_summary'] });
  qc.invalidateQueries({ queryKey: ['panel_claim_items'] });
  qc.invalidateQueries({ queryKey: ['ledger_item_totals'] });
  qc.invalidateQueries({ queryKey: ['receipt_payload'] });
}

export function useDocumentTemplates() {
  return useQuery({
    queryKey: ['document-templates'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('clinic_document_templates')
        .select('*')
        .eq('is_active', true)
        .order('name');
      if (error) throw error;
      return (data ?? []) as DocumentTemplate[];
    },
  });
}

export function useConsultationDocuments(consultationId: string | null | undefined) {
  return useQuery({
    queryKey: ['consultation-documents', consultationId],
    enabled: !!consultationId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('consultation_documents')
        .select('*')
        .eq('consultation_id', consultationId!)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as ConsultationDocument[];
    },
  });
}

export function useAddConsultationDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: IssueConsultationDocumentInput) => {
      const { data, error } = await consultationDocumentFeeDatabase.rpc(
        'issue_consultation_document_with_fee',
        {
          _document_id: input.id,
          _consultation_id: input.consultation_id,
          _patient_id: input.patient_id,
          _template_id: input.template_id ?? null,
          _template_name: input.template_name,
          _type: input.type ?? null,
          _content: input.content,
          _paper_size: input.paper_size,
          _orientation: input.orientation,
        },
      );
      if (error) throw error;
      if (!data) throw new Error('The document was not issued.');
      return data as ConsultationDocument;
    },
    onSuccess: (doc) => {
      invalidateDocumentBillingQueries(qc, doc.consultation_id);
      toast.success('Document attached to consultation');
    },
    onError: (e: Error) => toast.error(e.message || 'Failed to save document'),
  });
}

export function useUpdateConsultationDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; consultation_id: string; content: string }) => {
      const { data, error } = await supabase
        .from('consultation_documents')
        .update({ content: input.content })
        .eq('id', input.id)
        .select()
        .single();
      if (error) throw error;
      return data as ConsultationDocument;
    },
    onSuccess: (doc) => {
      qc.invalidateQueries({ queryKey: ['consultation-documents', doc.consultation_id] });
      toast.success('Document updated');
    },
    onError: (e: Error) => toast.error(e.message || 'Failed to update document'),
  });
}

export function useDeleteConsultationDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; consultation_id: string }) => {
      const { error } = await consultationDocumentFeeDatabase.rpc(
        'void_consultation_document_with_fee',
        { _document_id: input.id },
      );
      if (error) throw error;
      return input;
    },
    onSuccess: (input) => {
      invalidateDocumentBillingQueries(qc, input.consultation_id);
      toast.success('Document voided');
    },
    onError: (e: Error) => toast.error(e.message || 'Failed to void document'),
  });
}

export function useUpsertDocumentTemplate() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: {
      id?: string;
      name: string;
      type: string;
      content: string;
      paper_size: string;
      orientation: string;
      is_active?: boolean;
    }) => {
      const payload = {
        ...input,
        is_active: input.is_active ?? true,
        ...(input.id ? {} : { created_by: user?.id ?? null }),
      };
      const { data, error } = await supabase
        .from('clinic_document_templates')
        .upsert(payload)
        .select()
        .single();
      if (error) throw error;
      return data as DocumentTemplate;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['document-templates'] });
      toast.success('Template saved');
    },
    onError: (e: Error) => toast.error(e.message || 'Failed to save template'),
  });
}

export function useDeleteDocumentTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('clinic_document_templates')
        .update({ is_active: false })
        .eq('id', id);
      if (error) throw error;
      return id;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['document-templates'] });
      toast.success('Template deleted');
    },
    onError: (e: Error) => toast.error(e.message || 'Failed to delete template'),
  });
}

