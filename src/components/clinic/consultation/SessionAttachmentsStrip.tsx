import { useRef, useState } from 'react';
import { Image as ImageIcon, Paperclip, Trash2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  useConsultationAttachments,
  useDeleteAttachment,
  useUploadAttachment,
  type ConsultationAttachment,
} from '@/hooks/clinic/useAttachments';

interface SessionAttachmentsStripProps {
  consultationId: string | null | undefined;
  canEdit: boolean;
  onBeforeMutation?: () => Promise<boolean>;
  offlineConsultationId?: string | null;
}

export function SessionAttachmentsStrip({
  consultationId,
  canEdit,
  onBeforeMutation,
  offlineConsultationId,
}: SessionAttachmentsStripProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [remark, setRemark] = useState('');
  const { data: attachments = [], isLoading } =
    useConsultationAttachments(consultationId);
  const del = useDeleteAttachment({ offlineConsultationId });
  const upload = useUploadAttachment(consultationId);

  if (!consultationId) return null;

  const resetUpload = () => {
    setSelectedFile(null);
    setRemark('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleUpload = async () => {
    if (!selectedFile) return;
    try {
      if (onBeforeMutation && !(await onBeforeMutation())) return;
      await upload.mutateAsync({
        file: selectedFile,
        remark: remark.trim() || undefined,
      });
      resetUpload();
      toast.success('Clinical attachment uploaded');
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Failed to upload attachment',
      );
    }
  };

  const handleDelete = async (attachment: ConsultationAttachment) => {
    if (!attachment.consultation_id) return;
    if (!window.confirm(`Remove "${attachment.file_name}" from this session?`)) {
      return;
    }
    try {
      if (onBeforeMutation && !(await onBeforeMutation())) return;
      await del.mutateAsync({
        id: attachment.id,
        file_path: attachment.file_path,
        consultation_id: attachment.consultation_id,
      });
      toast.success('Attachment removed');
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Failed to remove attachment',
      );
    }
  };

  return (
    <div className="space-y-3">
      {canEdit && (
        <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
          <Input
            ref={fileInputRef}
            type="file"
            accept="image/*,application/pdf"
            aria-label="Clinical attachment"
            onChange={(event) =>
              setSelectedFile(event.target.files?.[0] ?? null)
            }
          />
          <Input
            value={remark}
            onChange={(event) => setRemark(event.target.value)}
            placeholder="Optional note"
            aria-label="Attachment note"
          />
          <Button
            type="button"
            onClick={handleUpload}
            disabled={!selectedFile || upload.isPending}
          >
            <Upload className="mr-2 h-4 w-4" />
            {upload.isPending ? 'Uploading...' : 'Upload'}
          </Button>
          <p className="text-xs text-slate-400 sm:col-span-3">
            Images or PDF, up to 5 MB.
          </p>
        </div>
      )}

      {isLoading ? (
        <p className="text-xs text-slate-400">Loading session attachments...</p>
      ) : attachments.length === 0 ? (
        <p className="text-xs text-slate-400">No files uploaded yet.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {attachments.map((attachment) => {
            const isImage = (attachment.content_type ?? '').startsWith('image/');
            const Icon = isImage ? ImageIcon : Paperclip;
            return (
              <div
                key={attachment.id}
                className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs transition-colors hover:bg-slate-100"
              >
                <Icon className="h-3.5 w-3.5 shrink-0 text-slate-500" />
                <span
                  className="max-w-[180px] truncate font-medium text-slate-700"
                  title={
                    attachment.remark
                      ? `${attachment.file_name} - ${attachment.remark}`
                      : attachment.file_name
                  }
                >
                  {attachment.file_name}
                </span>
                {attachment.remark && (
                  <span
                    className="max-w-[160px] truncate italic text-slate-500"
                    title={attachment.remark}
                  >
                    {attachment.remark}
                  </span>
                )}
                {attachment.signedUrl ? (
                  <a
                    href={attachment.signedUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0 font-semibold text-blue-600 hover:underline"
                  >
                    View
                  </a>
                ) : (
                  <span className="shrink-0 text-slate-400">Unavailable</span>
                )}
                {canEdit && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="-mr-1 h-5 w-5 rounded-full text-slate-400 hover:bg-red-50 hover:text-red-600"
                    onClick={() => handleDelete(attachment)}
                    disabled={del.isPending}
                    aria-label={`Remove ${attachment.file_name}`}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default SessionAttachmentsStrip;
