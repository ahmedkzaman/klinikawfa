import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

const BUCKET = 'visit-attachment';
const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

export interface ConsultationAttachment {
  id: string;
  consultation_id: string;
  file_path: string;
  file_name: string;
  content_type: string | null;
  created_at: string;
  signedUrl: string | null;
}

/**
 * Strip path separators and collapse runs of whitespace so storage keys stay
 * predictable and don't accidentally create nested folders from the file name.
 */
function sanitizeFileName(name: string): string {
  return name.replace(/[\\/]+/g, '_').replace(/\s+/g, ' ').trim() || 'file';
}

/**
 * Mutation: upload a single File to the private `visit-attachment` bucket
 * and persist a row in `consultation_attachments`.
 *
 * - Enforces a 5MB size limit.
 * - Path layout: `<consultationId>/<timestamp>_<safeName>`.
 */
export function useUploadAttachment(consultationId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (file: File) => {
      if (!consultationId) {
        throw new Error('Missing consultation context');
      }
      if (!file) {
        throw new Error('No file selected');
      }
      if (file.size > MAX_BYTES) {
        throw new Error('File exceeds 5MB limit');
      }

      const safeName = sanitizeFileName(file.name);
      const path = `${consultationId}/${Date.now()}_${safeName}`;

      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(path, file, {
          contentType: file.type || undefined,
          upsert: false,
        });
      if (upErr) throw upErr;

      const {
        data: { user },
      } = await supabase.auth.getUser();

      const { data, error } = await supabase
        .from('consultation_attachments')
        .insert({
          consultation_id: consultationId,
          file_path: path,
          file_name: file.name,
          content_type: file.type || null,
          uploaded_by: user?.id ?? null,
        })
        .select()
        .single();

      if (error) {
        // Best-effort cleanup so we don't leave orphan storage objects.
        await supabase.storage.from(BUCKET).remove([path]);
        throw error;
      }
      return data;
    },
    onSettled: () => {
      if (consultationId) {
        qc.invalidateQueries({
          queryKey: ['clinic', 'attachments', consultationId],
        });
      }
    },
  });
}

/**
 * Query: load attachments for a consultation and return rows merged with a
 * 60-second signed URL each (the bucket is private).
 *
 * staleTime is set to 45s so the URLs stay valid across re-renders while the
 * user reads the list, without thrashing.
 */
export function useConsultationAttachments(
  consultationId: string | null | undefined,
) {
  return useQuery<ConsultationAttachment[]>({
    queryKey: ['clinic', 'attachments', consultationId ?? null],
    enabled: !!consultationId,
    staleTime: 45_000,
    gcTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('consultation_attachments')
        .select('id, consultation_id, file_path, file_name, content_type, created_at')
        .eq('consultation_id', consultationId as string)
        .order('created_at', { ascending: false });
      if (error) throw error;

      const rows = data ?? [];
      const signed = await Promise.all(
        rows.map(async (r) => {
          const { data: s } = await supabase.storage
            .from(BUCKET)
            .createSignedUrl(r.file_path, 60);
          return { ...r, signedUrl: s?.signedUrl ?? null };
        }),
      );
      return signed as ConsultationAttachment[];
    },
  });
}
