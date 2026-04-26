import {
  FileText,
  Image as ImageIcon,
  Paperclip,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  useConsultationAttachments,
  useDeleteAttachment,
  type ConsultationAttachment,
} from '@/hooks/clinic/useAttachments';

interface SessionAttachmentsStripProps {
  consultationId: string | null | undefined;
  canEdit: boolean;
}

/**
 * Compact pill-row of files staff have uploaded to the active consultation.
 * Designed to live directly under the Dispense Note in the doctor's view so
 * they see new lab results / photos in real time.
 */
export function SessionAttachmentsStrip({
  consultationId,
  canEdit,
}: SessionAttachmentsStripProps) {
  const { data: attachments = [], isLoading } =
    useConsultationAttachments(consultationId);
  const del = useDeleteAttachment();

  if (!consultationId) return null;

  if (isLoading) {
    return (
      <p className="text-xs text-slate-400">Loading session attachments…</p>
    );
  }

  if (attachments.length === 0) {
    return (
      <p className="text-xs text-slate-400">No files uploaded yet.</p>
    );
  }

  const handleDelete = async (a: ConsultationAttachment) => {
    if (!a.consultation_id) return;
    if (!window.confirm(`Remove "${a.file_name}" from this session?`)) return;
    try {
      await del.mutateAsync({
        id: a.id,
        file_path: a.file_path,
        consultation_id: a.consultation_id,
      });
      toast.success('Attachment removed');
    } catch (err) {
      toast.error((err as Error).message || 'Failed to remove attachment');
    }
  };

  return (
    <div className="flex flex-wrap gap-2">
      {attachments.map((a) => {
        const isImage = (a.content_type ?? '').startsWith('image/');
        const Icon = isImage ? ImageIcon : Paperclip;
        return (
          <div
            key={a.id}
            className="inline-flex items-center gap-2 rounded-full bg-slate-50 hover:bg-slate-100 border border-slate-200 px-3 py-1.5 text-xs transition-colors"
          >
            <Icon className="h-3.5 w-3.5 text-slate-500 shrink-0" />
            <span
              className="truncate max-w-[180px] font-medium text-slate-700"
              title={a.file_name}
            >
              {a.file_name}
            </span>
            {a.signedUrl ? (
              <a
                href={a.signedUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-blue-600 hover:underline shrink-0"
              >
                View
              </a>
            ) : (
              <span className="text-slate-400 shrink-0">Unavailable</span>
            )}
            {canEdit && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-5 w-5 -mr-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-full"
                onClick={() => handleDelete(a)}
                disabled={del.isPending}
                aria-label={`Remove ${a.file_name}`}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            )}
          </div>
        );
      })}

      {/* Fallback for the FileText import used elsewhere — keeps tree-shaken
          icons available if we add list mode later */}
      <FileText className="hidden" aria-hidden />
    </div>
  );
}

export default SessionAttachmentsStrip;
