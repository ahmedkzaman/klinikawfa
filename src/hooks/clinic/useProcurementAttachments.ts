import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export const PROCUREMENT_BUCKET = 'procurement-documents';
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB
const ALLOWED_MIME_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];

export type ProcurementAttachmentRow = {
  id: string;
  po_id: string;
  storage_path: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  created_at: string;
  uploaded_by: string | null;
};

const LIST_KEY = (poId: string) => ['procurement', 'attachments', poId];

function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-120) || 'file';
}

/** List attachment metadata for one purchase order. */
export function useProcurementAttachments(poId: string | null) {
  const queryClient = useQueryClient();

  const attachments = useQuery({
    queryKey: LIST_KEY(poId ?? 'none'),
    enabled: !!poId,
    queryFn: async (): Promise<ProcurementAttachmentRow[]> => {
      const { data, error } = await supabase
        .from('procurement_attachments')
        .select('*')
        .eq('po_id', poId!)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as ProcurementAttachmentRow[];
    },
  });

  const uploadAttachment = useMutation({
    mutationFn: async ({ file }: { file: File }) => {
      if (!poId) throw new Error('Save the order before uploading evidence');
      if (!ALLOWED_MIME_TYPES.includes(file.type)) {
        throw new Error('Only PDF, JPEG, PNG, and WebP file types are allowed');
      }
      if (file.size > MAX_BYTES) {
        throw new Error('Files must be 10 MB or smaller');
      }

      const path = `${poId}/${crypto.randomUUID()}-${sanitizeFileName(file.name)}`;
      const storage = supabase.storage.from(PROCUREMENT_BUCKET);

      // No upsert: paths are UUID-prefixed and unique per attempt.
      const { error: uploadError } = await storage.upload(path, file, { upsert: false });
      if (uploadError) throw uploadError;

      const { error: metaError } = await supabase.from('procurement_attachments').insert({
        po_id: poId,
        storage_path: path,
        file_name: file.name,
        mime_type: file.type,
        size_bytes: file.size,
      });
      if (metaError) {
        // Do not leave orphaned objects behind when metadata insertion fails.
        await storage.remove([path]);
        throw metaError;
      }
    },
    onSuccess: () => {
      if (poId) queryClient.invalidateQueries({ queryKey: LIST_KEY(poId) });
    },
  });

  const deleteAttachment = useMutation({
    mutationFn: async ({ id, storagePath }: { id: string; storagePath: string }) => {
      const storage = supabase.storage.from(PROCUREMENT_BUCKET);
      const { error: storageError } = await storage.remove([storagePath]);
      if (storageError) throw storageError;

      const { error: metaError } = await supabase
        .from('procurement_attachments')
        .delete()
        .eq('id', id);
      if (metaError) throw metaError;
    },
    onSuccess: () => {
      if (poId) queryClient.invalidateQueries({ queryKey: LIST_KEY(poId) });
    },
  });

  /** Authenticated Storage download — never a public URL. */
  const downloadAttachment = async (storagePath: string, fileName: string) => {
    const { data, error } = await supabase.storage.from(PROCUREMENT_BUCKET).download(storagePath);
    if (error) throw error;
    const url = URL.createObjectURL(data);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  return { attachments, uploadAttachment, deleteAttachment, downloadAttachment };
}
