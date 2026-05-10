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
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: {
      consultation_id: string;
      patient_id: string;
      template_id?: string | null;
      template_name: string;
      type?: string | null;
      content: string;
      paper_size: string;
      orientation: string;
    }) => {
      const { data, error } = await supabase
        .from('consultation_documents')
        .insert({ ...input, created_by: user?.id ?? null })
        .select()
        .single();
      if (error) throw error;
      return data as ConsultationDocument;
    },
    onSuccess: (doc) => {
      qc.invalidateQueries({ queryKey: ['consultation-documents', doc.consultation_id] });
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
      const { error } = await supabase
        .from('consultation_documents')
        .delete()
        .eq('id', input.id);
      if (error) throw error;
      return input;
    },
    onSuccess: (input) => {
      qc.invalidateQueries({ queryKey: ['consultation-documents', input.consultation_id] });
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
        created_by: user?.id ?? null,
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
