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
  remark: string | null;
  signedUrl: string | null;
}

type UploadAttachmentOptions = {
  offlineConsultationId?: string | null;
};

type OfflineAttachmentReservation = {
  reservation_id: string;
  file_path: string;
  expires_at: string;
};

type OfflineAttachmentUploadResolution = {
  status: 'finalized' | 'cleanup_required' | 'cancelled';
  file_path: string;
  attachment_id: string | null;
};


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
export function useUploadAttachment(
  consultationId: string | null | undefined,
  options?: UploadAttachmentOptions,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: File | { file: File; remark?: string | null }) => {
      const file = args instanceof File ? args : args.file;
      const remark = args instanceof File ? null : (args.remark?.trim() || null);
      if (!consultationId) {
        throw new Error('Missing consultation context');
      }
      if (!file) {
        throw new Error('No file selected');
      }
      if (file.size > MAX_BYTES) {
        throw new Error('File exceeds 5MB limit');
      }

      const offlineConsultationId = options?.offlineConsultationId;
      if (offlineConsultationId) {
        if (offlineConsultationId !== consultationId) {
          throw new Error('Attachment consultation does not match the offline editor.');
        }

        const { data: reservationRows, error: reservationError } = await supabase.rpc(
          'reserve_offline_consultation_attachment',
          {
            p_consultation_id: offlineConsultationId,
            p_file_name: file.name,
            p_content_type: file.type || null,
            p_file_size: file.size,
            p_remark: remark,
          },
        );
        if (reservationError) throw reservationError;

        const reservation = (reservationRows ?? [])[0] as
          | OfflineAttachmentReservation
          | undefined;
        if (!reservation) {
          throw new Error('Attachment upload reservation was not returned.');
        }

        const resolveFailedUpload = async () => {
          const { data: resolutionRows, error: resolutionError } = await supabase.rpc(
            'cancel_offline_consultation_attachment_upload',
            { p_reservation_id: reservation.reservation_id },
          );
          if (resolutionError) throw resolutionError;
          return (resolutionRows ?? [])[0] as
            | OfflineAttachmentUploadResolution
            | undefined;
        };

        try {
          const { error: uploadError } = await supabase.storage
            .from(BUCKET)
            .upload(reservation.file_path, file, {
              contentType: file.type || undefined,
              upsert: false,
            });
          if (uploadError) throw uploadError;

          const { data, error: finalizeError } = await supabase.rpc(
            'finalize_offline_consultation_attachment',
            { p_reservation_id: reservation.reservation_id },
          );
          if (finalizeError) throw finalizeError;
          if (!data) throw new Error('Attachment metadata was not finalized.');
          return data;
        } catch (uploadError) {
          let resolution: OfflineAttachmentUploadResolution | undefined;
          try {
            resolution = await resolveFailedUpload();
          } catch {
            throw uploadError;
          }

          if (resolution?.status === 'finalized' && resolution.attachment_id) {
            return {
              id: resolution.attachment_id,
              consultation_id: offlineConsultationId,
              file_path: resolution.file_path,
              file_name: file.name,
              content_type: file.type || null,
              created_at: new Date().toISOString(),
              remark,
              signedUrl: null,
            } satisfies ConsultationAttachment;
          }

          if (resolution?.status === 'cleanup_required') {
            const { error: cleanupError } = await supabase.storage
              .from(BUCKET)
              .remove([resolution.file_path]);
            if (!cleanupError) {
              try {
                await resolveFailedUpload();
              } catch {
                // The object is gone; the durable cleanup row can be reconciled later.
              }
            }
          }

          throw uploadError;
        }
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
          remark,
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
        .select('id, consultation_id, file_path, file_name, content_type, created_at, remark')
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

/**
 * Mutation: remove an attachment from both storage and the tracking table.
 * Accepts the row directly so we don't need to refetch it. Invalidates both
 * the per-consultation attachment list AND the patient visit-history query
 * (so the joined attachment-count badge stays in sync).
 */
export function useDeleteAttachment(options?: {
  offlineConsultationId?: string | null;
}) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (row: {
      id: string;
      file_path: string;
      consultation_id: string;
    }) => {
      if (options?.offlineConsultationId) {
        if (row.consultation_id !== options.offlineConsultationId) {
          throw new Error('Attachment consultation does not match the offline editor.');
        }
        const { data: authorizedPath, error: rpcErr } = await supabase.rpc(
          'delete_offline_consultation_attachment',
          {
            p_attachment_id: row.id,
            p_consultation_id: options.offlineConsultationId,
          },
        );
        if (rpcErr) throw rpcErr;
        if (!authorizedPath) throw new Error('Attachment path was not returned.');

        const { error: storageErr } = await supabase.storage
          .from(BUCKET)
          .remove([authorizedPath]);
        if (storageErr) throw storageErr;
        return { ...row, file_path: authorizedPath };
      }

      // Storage first — if this fails the DB row stays so the UI still
      // shows the file (and the user can retry). If the DB delete fails
      // after, the file is already gone but a stale row will surface as
      // "Unavailable" in the list (signedUrl will be null).
      const { error: storageErr } = await supabase.storage
        .from(BUCKET)
        .remove([row.file_path]);
      if (storageErr) throw storageErr;

      const { error: dbErr } = await supabase
        .from('consultation_attachments')
        .delete()
        .eq('id', row.id);
      if (dbErr) throw dbErr;

      return row;
    },
    onSuccess: (row) => {
      qc.invalidateQueries({
        queryKey: ['clinic', 'attachments', row.consultation_id],
      });
      qc.invalidateQueries({
        queryKey: ['clinic', 'patient-visit-history'],
      });
    },
  });
}
