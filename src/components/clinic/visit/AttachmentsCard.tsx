import { useRef, useState } from 'react';
import { format } from 'date-fns';
import { FileText, Image as ImageIcon, Paperclip, Upload, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  useConsultationAttachments,
  useUploadAttachment,
  useDeleteAttachment,
} from '@/hooks/clinic/useAttachments';


interface AttachmentsCardProps {
  consultationId: string | null | undefined;
}

/**
 * Dispensary-side widget for staff to attach lab results, photos, or PDFs to
 * the active consultation. Files land in the private `visit-attachment` bucket
 * and are surfaced via short-lived signed URLs.
 */
export function AttachmentsCard({ consultationId }: AttachmentsCardProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const { data: attachments = [], isLoading } =
    useConsultationAttachments(consultationId);
  const upload = useUploadAttachment(consultationId);

  const disabled = !consultationId;

  const handleUpload = async () => {
    if (!selectedFile || disabled) return;
    try {
      await upload.mutateAsync(selectedFile);
      toast.success('Attachment uploaded');
      setSelectedFile(null);
      if (inputRef.current) inputRef.current.value = '';
    } catch (err) {
      toast.error((err as Error).message || 'Upload failed');
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Paperclip className="h-4 w-4 text-primary" />
          Clinical Attachments (Labs / Photos)
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-col sm:flex-row gap-2">
          <Input
            ref={inputRef}
            type="file"
            accept="image/*,application/pdf"
            disabled={disabled || upload.isPending}
            onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)}
            className="flex-1"
          />
          <Button
            onClick={handleUpload}
            disabled={disabled || !selectedFile || upload.isPending}
            size="sm"
          >
            <Upload className="h-4 w-4 mr-1.5" />
            {upload.isPending ? 'Uploading…' : 'Upload'}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Max 5MB. Images or PDFs.
        </p>

        <div className="border-t pt-3">
          {isLoading ? (
            <p className="text-xs text-muted-foreground">Loading attachments…</p>
          ) : attachments.length === 0 ? (
            <p className="text-xs text-muted-foreground">No attachments yet.</p>
          ) : (
            <ul className="space-y-1.5">
              {attachments.map((a) => {
                const isImage = (a.content_type ?? '').startsWith('image/');
                const Icon = isImage ? ImageIcon : FileText;
                return (
                  <li
                    key={a.id}
                    className="flex items-center justify-between gap-2 rounded-md bg-muted/40 px-2 py-1.5 text-sm"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                      <div className="min-w-0">
                        <p className="truncate font-medium">{a.file_name}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {(() => {
                            try {
                              return format(new Date(a.created_at), 'd MMM yyyy, h:mma');
                            } catch {
                              return '';
                            }
                          })()}
                        </p>
                      </div>
                    </div>
                    {a.signedUrl ? (
                      <a
                        href={a.signedUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs font-medium text-primary hover:underline shrink-0"
                      >
                        View
                      </a>
                    ) : (
                      <span className="text-xs text-muted-foreground shrink-0">
                        Unavailable
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default AttachmentsCard;
