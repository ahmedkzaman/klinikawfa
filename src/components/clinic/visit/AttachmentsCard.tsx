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
  const [remark, setRemark] = useState('');

  const { data: attachments = [], isLoading } =
    useConsultationAttachments(consultationId);
  const upload = useUploadAttachment(consultationId);
  const remove = useDeleteAttachment();
  const [confirmDelete, setConfirmDelete] = useState<{
    id: string;
    file_path: string;
    file_name: string;
  } | null>(null);

  const disabled = !consultationId;

  const handleUpload = async () => {
    if (!selectedFile || disabled) return;
    try {
      await upload.mutateAsync({ file: selectedFile, remark });
      toast.success('Attachment uploaded');
      setSelectedFile(null);
      setRemark('');
      if (inputRef.current) inputRef.current.value = '';
    } catch (err) {
      toast.error((err as Error).message || 'Upload failed');
    }
  };


  const handleConfirmDelete = async () => {
    if (!confirmDelete || !consultationId) return;
    try {
      await remove.mutateAsync({
        id: confirmDelete.id,
        file_path: confirmDelete.file_path,
        consultation_id: consultationId,
      });
      toast.success('Attachment deleted');
      setConfirmDelete(null);
    } catch (err) {
      toast.error((err as Error).message || 'Delete failed');
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
        <Input
          placeholder="Add a description or remark (optional)..."
          value={remark}
          onChange={(e) => setRemark(e.target.value)}
          disabled={disabled || upload.isPending}
        />
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
                    <div className="flex items-center gap-2 shrink-0">
                      {a.signedUrl ? (
                        <a
                          href={a.signedUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs font-medium text-primary hover:underline"
                        >
                          View
                        </a>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          Unavailable
                        </span>
                      )}
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive"
                        disabled={remove.isPending}
                        onClick={() =>
                          setConfirmDelete({
                            id: a.id,
                            file_path: a.file_path,
                            file_name: a.file_name,
                          })
                        }
                        aria-label={`Delete ${a.file_name}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>

                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </CardContent>

      <AlertDialog
        open={!!confirmDelete}
        onOpenChange={(open) => {
          if (!open) setConfirmDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this attachment?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDelete?.file_name
                ? `"${confirmDelete.file_name}" will be permanently removed from storage. This cannot be undone.`
                : 'This attachment will be permanently removed from storage. This cannot be undone.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={remove.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              disabled={remove.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {remove.isPending ? 'Deleting…' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}


export default AttachmentsCard;
