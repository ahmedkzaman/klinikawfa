import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download, Loader2, Printer } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useClinicSettings } from '@/hooks/clinic/useClinicSettings';
import { downloadReceiptPdf, printReceipt } from '@/lib/clinic/printReceipt';
import {
  buildReceiptData,
  receiptErrorMessage,
  type PaymentBatchReceiptSnapshot,
} from '@/lib/clinic/receiptPayload';
import { ReceiptTemplate, type ReceiptData } from './ReceiptTemplate';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  paymentId: string | null;
  /** When true, auto-trigger PDF download once the receipt data loads, then close. */
  autoDownload?: boolean;
}

export function PrintReceiptDialog({ open, onOpenChange, paymentId, autoDownload = false }: Props) {
  const { settings } = useClinicSettings();
  const { data, isLoading, error: receiptError } = useQuery<ReceiptData | null>({
    queryKey: ['receipt_payload', paymentId],
    enabled: open && Boolean(paymentId),
    queryFn: async () => {
      if (!paymentId) return null;
      const { data: snapshot, error } = await supabase.rpc('get_payment_batch_receipt', {
        p_payment_id: paymentId,
      });
      if (error) throw new Error(error.message || 'Failed to load receipt');
      return buildReceiptData(
        (snapshot ?? {}) as unknown as PaymentBatchReceiptSnapshot,
      );
    },
  });

  const receiptRef = useRef<HTMLDivElement>(null);
  const [downloading, setDownloading] = useState(false);
  const [printing, setPrinting] = useState(false);

  const handlePrint = async () => {
    if (!data) return;
    setPrinting(true);
    try {
      await printReceipt(data, settings);
    } finally {
      setPrinting(false);
    }
  };

  const handleDownloadPdf = async () => {
    if (!data) return;
    setDownloading(true);
    try {
      await downloadReceiptPdf(data, settings);
    } finally {
      setDownloading(false);
    }
  };

  const autoDownloadTriggeredRef = useRef<string | null>(null);
  useEffect(() => {
    if (!open || !autoDownload || !data || isLoading || downloading) return;
    if (autoDownloadTriggeredRef.current === data.paymentId) return;
    autoDownloadTriggeredRef.current = data.paymentId;
    void (async () => {
      await handleDownloadPdf();
      onOpenChange(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, autoDownload, data, isLoading]);

  useEffect(() => {
    if (!open) autoDownloadTriggeredRef.current = null;
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg p-0 gap-0">
        <DialogHeader className="px-4 py-3 border-b no-print">
          <DialogTitle>Receipt Preview</DialogTitle>
        </DialogHeader>

        <div className="max-h-[70vh] overflow-y-auto bg-slate-100 p-4">
          {receiptError ? (
            <div role="alert" className="py-16 text-center text-sm text-destructive">
              {receiptErrorMessage(receiptError)}
            </div>
          ) : isLoading || !data ? (
            <div className="flex items-center justify-center py-16 text-slate-500">
              <Loader2 className="h-5 w-5 animate-spin mr-2" />
              Loading receipt…
            </div>
          ) : (
            <div ref={receiptRef}>
              <ReceiptTemplate data={data} settings={settings} />
            </div>
          )}
        </div>

        <DialogFooter className="px-4 py-3 border-t no-print">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={!data || downloading}
            onClick={handleDownloadPdf}
          >
            {downloading ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Download className="h-4 w-4 mr-2" />
            )}
            Download PDF
          </Button>
          <Button type="button" disabled={!data || printing} onClick={handlePrint}>
            {printing ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Printer className="h-4 w-4 mr-2" />
            )}
            Print Receipt
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
