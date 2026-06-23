import { useRef, useState } from 'react';
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

  const handlePrint = () => {
    window.print();
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
            <ReceiptTemplate data={data} settings={settings} />
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
          <Button type="button" disabled={!data} onClick={handlePrint}>
            <Printer className="h-4 w-4 mr-2" />
            Print Receipt
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
