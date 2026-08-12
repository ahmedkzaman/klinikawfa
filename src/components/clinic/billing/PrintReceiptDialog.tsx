import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Printer, Loader2, Download } from 'lucide-react';
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
import { downloadReceiptPdf, printReceipt } from '@/lib/clinic/printReceipt';
import { sumActiveBillingLines } from '@/lib/clinic/billingLedgerTotals';
import { calculateDualLedger } from '@/lib/clinic/dualLedger';
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

      const { data: queuePayments, error: paymentsErr } = await supabase
        .from('payments')
        .select('id, amount, payment_method, created_at')
        .eq('queue_entry_id', pay.queue_entry_id)
        .is('deleted_at', null);
      if (paymentsErr) throw paymentsErr;

      const { data: claims, error: claimsErr } = await supabase
        .from('panel_claims')
        .select('amount, received_amount, status')
        .eq('queue_entry_id', pay.queue_entry_id);
      if (claimsErr) throw claimsErr;
      const activeClaims = (claims ?? []).filter((claim) =>
        ['pending', 'submitted', 'approved', 'received'].includes(String(claim.status).toLowerCase()),
      );

      let items: ReceiptData['items'] = [];
      let subtotal = 0;
      if (pay.consultation_id) {
        const { data: rows, error: itemsErr } = await supabase
          .from('consultation_items')
          .select('item_name, quantity, price, item_id')
          .eq('consultation_id', pay.consultation_id)
          .is('deleted_at', null)
          .order('created_at', { ascending: true });
        if (itemsErr) throw itemsErr;
        items = (rows ?? []).map((r) => {
          const qty = Number(r.quantity ?? 0);
          const unit = Number(r.price ?? 0);
          const lineTotal = sumActiveBillingLines([{ price: unit, quantity: qty }]);
          return {
            name: r.item_name,
            quantity: qty,
            unit_price: unit,
            line_total: lineTotal,
          };
        });
        subtotal = sumActiveBillingLines(rows ?? []);
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const qe: any = (pay as any).queue_entries;
      const patient = qe?.patients ?? null;
      const panelAmount = activeClaims.reduce((sum, claim) => sum + Number(claim.amount ?? 0), 0);
      const panelReceived = activeClaims.reduce((sum, claim) => sum + Number(claim.received_amount ?? 0), 0);
      const panelPayments = (queuePayments ?? []).reduce((sum, payment) =>
        sum + (payment.payment_method === 'panel' ? Number(payment.amount ?? 0) : 0), 0);
      const patientPortions = (queuePayments ?? []).filter((payment) => payment.payment_method !== 'panel');
      const ledger = calculateDualLedger({
        billedTotal: subtotal,
        patientPayments: patientPortions.map((payment) => ({
          amount: Number(payment.amount ?? 0),
          paymentMethod: payment.payment_method,
        })),
        panelPayments,
        expectsPanel: pay.payment_type === 'panel' || pay.payment_type === 'insurance',
        panelClaim: activeClaims.length ? {
          amount: panelAmount,
          receivedAmount: panelReceived,
          status: String(activeClaims[0].status),
        } : null,
      });

      return {
        paymentId: pay.id,
        paymentMethod: pay.payment_method,
        paymentType: pay.payment_type,
        amountPaid: patientPortions.reduce((sum, payment) => sum + Number(payment.amount ?? 0), 0),
        paymentPortions: patientPortions.map((payment) => ({
          id: payment.id,
          method: payment.payment_method,
          amount: Number(payment.amount ?? 0),
        })),
        createdAt: pay.created_at,
        queueLabel: qe?.queue_sequence
          ? formatQueueNo(qe.created_at ?? pay.created_at, qe.queue_sequence)
          : null,
        patientName: patient?.name ?? 'Walk-in',
        patientIc: patient?.national_id ?? null,
        patientAge: patient?.date_of_birth
          ? calculateClinicalAge(patient.date_of_birth).replace(/^Age:\s*/i, '')
          : null,
        items,
        subtotal,
        invoiceTotal: subtotal,
        balanceRemaining: ledger.patientOutstanding,
        panelBilled: ledger.panelCovered,
        panelOutstanding: ledger.panelOutstanding,
      } satisfies ReceiptData;
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
    (async () => {
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

