import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Printer, Loader2, Download } from 'lucide-react';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useClinicSettings } from '@/hooks/clinic/useClinicSettings';
import { formatQueueNo } from '@/lib/clinic/queueNumber';
import { calculateClinicalAge } from '@/lib/clinic/clinicalAge';
import { ReceiptTemplate, type ReceiptData } from './ReceiptTemplate';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  paymentId: string | null;
  /** When true, auto-trigger PDF download once the receipt data loads, then close. */
  autoDownload?: boolean;
}

export function PrintReceiptDialog({ open, onOpenChange, paymentId }: Props) {
  const { settings } = useClinicSettings();

  const { data, isLoading } = useQuery<ReceiptData | null>({
    queryKey: ['receipt_payload', paymentId],
    enabled: open && !!paymentId,
    queryFn: async () => {
      if (!paymentId) return null;
      const { data: pay, error } = await supabase
        .from('payments')
        .select(
          `
          id, payment_method, payment_type, amount, created_at,
          queue_entry_id, consultation_id,
          queue_entries (
            queue_sequence, created_at,
            patients ( name, national_id, date_of_birth )
          )
        `,
        )
        .eq('id', paymentId)
        .maybeSingle();
      if (error) throw error;
      if (!pay) return null;

      let items: ReceiptData['items'] = [];
      let subtotal = 0;
      if (pay.consultation_id) {
        const { data: rows, error: itemsErr } = await supabase
          .from('consultation_items')
          .select('item_name, quantity, price, dispensed_qty, item_id')
          .eq('consultation_id', pay.consultation_id)
          .is('deleted_at', null)
          .order('created_at', { ascending: true });
        if (itemsErr) throw itemsErr;
        items = (rows ?? []).map((r) => {
          const qty =
            r.dispensed_qty != null && r.item_id
              ? Number(r.dispensed_qty)
              : Number(r.quantity ?? 0);
          const unit = Number(r.price ?? 0);
          const lineTotal = unit * qty;
          subtotal += lineTotal;
          return {
            name: r.item_name,
            quantity: qty,
            unit_price: unit,
            line_total: lineTotal,
          };
        });
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const qe: any = (pay as any).queue_entries;
      const patient = qe?.patients ?? null;

      return {
        paymentId: pay.id,
        paymentMethod: pay.payment_method,
        paymentType: pay.payment_type,
        amountPaid: Number(pay.amount ?? 0),
        createdAt: pay.created_at,
        queueLabel: qe?.queue_sequence
          ? formatQueueNo(qe.created_at ?? pay.created_at, qe.queue_sequence)
          : null,
        patientName: patient?.name ?? 'Walk-in',
        patientIc: patient?.national_id ?? null,
        patientAge: calculateClinicalAge(patient?.date_of_birth),
        items,
        subtotal,
        invoiceTotal: subtotal,
        balanceRemaining: Math.max(0, subtotal - Number(pay.amount ?? 0)),
      } satisfies ReceiptData;
    },
  });

  const receiptRef = useRef<HTMLDivElement>(null);
  const [downloading, setDownloading] = useState(false);

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadPdf = async () => {
    if (!receiptRef.current || !data) return;
    setDownloading(true);
    let host: HTMLDivElement | null = null;
    try {
      // Render the receipt off-screen at exact A4 content width so html2canvas
      // captures the real layout (not the constrained dialog width).
      const A4_WIDTH_MM = 210;
      const A4_HEIGHT_MM = 297;
      const MARGIN_MM = 12;
      const CONTENT_WIDTH_MM = A4_WIDTH_MM - MARGIN_MM * 2; // 186mm
      const MM_TO_PX = 96 / 25.4; // CSS px per mm @ 96dpi
      const RENDER_WIDTH_PX = Math.round(CONTENT_WIDTH_MM * MM_TO_PX); // ~703px

      const clone = receiptRef.current.cloneNode(true) as HTMLDivElement;
      // Reset constraining classes/styles on the cloned root
      clone.style.width = `${RENDER_WIDTH_PX}px`;
      clone.style.maxWidth = 'none';
      clone.style.minHeight = '0';
      clone.style.margin = '0';
      clone.style.padding = '0';
      clone.style.background = '#ffffff';
      clone.style.color = '#000000';

      host = document.createElement('div');
      host.style.position = 'fixed';
      host.style.left = '-10000px';
      host.style.top = '0';
      host.style.width = `${RENDER_WIDTH_PX}px`;
      host.style.background = '#ffffff';
      host.style.zIndex = '-1';
      host.appendChild(clone);
      document.body.appendChild(host);

      // Wait a tick for layout/images
      await new Promise((r) => requestAnimationFrame(() => r(null)));
      const imgs = Array.from(clone.querySelectorAll('img'));
      await Promise.all(
        imgs.map(
          (img) =>
            new Promise<void>((resolve) => {
              if (img.complete && img.naturalWidth > 0) return resolve();
              img.onload = () => resolve();
              img.onerror = () => resolve();
            }),
        ),
      );

      const canvas = await html2canvas(clone, {
        scale: 2,
        backgroundColor: '#ffffff',
        useCORS: true,
        windowWidth: RENDER_WIDTH_PX,
        width: RENDER_WIDTH_PX,
      });

      const pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
      const imgWidth = CONTENT_WIDTH_MM;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      const imgData = canvas.toDataURL('image/jpeg', 0.95);
      const pageContentHeight = A4_HEIGHT_MM - MARGIN_MM * 2;

      let heightLeft = imgHeight;
      let position = MARGIN_MM;
      pdf.addImage(imgData, 'JPEG', MARGIN_MM, position, imgWidth, imgHeight);
      heightLeft -= pageContentHeight;
      while (heightLeft > 0) {
        position = MARGIN_MM - (imgHeight - heightLeft);
        pdf.addPage();
        pdf.addImage(imgData, 'JPEG', MARGIN_MM, position, imgWidth, imgHeight);
        heightLeft -= pageContentHeight;
      }

      const shortId = data.paymentId.slice(0, 8).toUpperCase();
      pdf.save(`Receipt-${shortId}.pdf`);
    } catch (e) {
      console.error('PDF download failed', e);
      toast.error('Failed to generate PDF');
    } finally {
      if (host && host.parentNode) host.parentNode.removeChild(host);
      setDownloading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg p-0 gap-0">
        <DialogHeader className="px-4 py-3 border-b no-print">
          <DialogTitle>Receipt Preview</DialogTitle>
        </DialogHeader>

        <div className="max-h-[70vh] overflow-y-auto bg-slate-100 p-4">
          {isLoading || !data ? (
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
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
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
          <Button type="button" disabled={!data} onClick={handlePrint}>
            <Printer className="h-4 w-4 mr-2" />
            Print Receipt
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

