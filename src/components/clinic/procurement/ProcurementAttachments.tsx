import { memo, useRef } from 'react';
import { format } from 'date-fns';
import { Download, Paperclip, Trash2, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  useProcurementAttachments,
  type ProcurementAttachmentRow,
} from '@/hooks/clinic/useProcurementAttachments';

const ACCEPTED_TYPES = 'application/pdf,image/jpeg,image/png,image/webp';
const MAX_MB = 10;

interface ProcurementAttachmentsProps {
  poId: string;
}

/** External-order evidence: private-bucket documents for one purchase order. */
export const ProcurementAttachments = memo(function ProcurementAttachments({
  poId,
}: ProcurementAttachmentsProps) {
  const { attachments, uploadAttachment, deleteAttachment, downloadAttachment } =
    useProcurementAttachments(poId);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const rows = (attachments.data ?? []) as ProcurementAttachmentRow[];

  const onFileChosen = async (file: File | undefined) => {
    if (!file) return;
    try {
      await uploadAttachment.mutateAsync({ file });
    } catch {
      // Error surfaced by caller/toast; keep the order form intact.
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 font-semibold">
          <Paperclip className="h-4 w-4" aria-hidden="true" />
          Order evidence
        </h3>
        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPTED_TYPES}
            className="hidden"
            onChange={(e) => void onFileChosen(e.target.files?.[0])}
            aria-label="Upload evidence file"
          />
          <Button
            size="sm"
            variant="outline"
            disabled={uploadAttachment.isPending}
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="h-4 w-4 mr-1" />
            {uploadAttachment.isPending ? 'Uploading…' : 'Upload file'}
          </Button>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Supplier screenshots, invoices, or delivery orders. PDF, JPEG, PNG, or WebP up to {MAX_MB} MB.
        Stored privately — only procurement staff can open them.
      </p>

      {attachments.isLoading ? (
        <Skeleton className="h-16 w-full" />
      ) : rows.length === 0 ? (
        <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
          No files uploaded yet.
        </p>
      ) : (
        <ul className="space-y-2">
          {rows.map((row) => (
            <li
              key={row.id}
              className="flex flex-col gap-2 rounded-md border p-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{row.file_name}</p>
                <p className="text-xs text-muted-foreground">
                  Uploaded {format(new Date(row.created_at), 'MMM d, yyyy h:mm a')} ·{' '}
                  {(row.size_bytes / 1024).toFixed(0)} KB
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void downloadAttachment(row.storage_path, row.file_name)}
                >
                  <Download className="h-4 w-4 mr-1" /> Download
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-destructive"
                  disabled={deleteAttachment.isPending}
                  onClick={() =>
                    void deleteAttachment.mutateAsync({ id: row.id, storagePath: row.storage_path })
                  }
                >
                  <Trash2 className="h-4 w-4 mr-1" /> Delete
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
});
