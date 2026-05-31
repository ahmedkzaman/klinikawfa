import { useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { useClinicSettings } from '@/hooks/clinic/useClinicSettings';
import { FREQUENCY_LABELS } from '@/lib/clinic/prescribingOptions';

interface DrugLabelPrintoutProps {
  consultationId: string;
  patientName?: string | null;
  open: boolean;
  onClose: () => void;
}

interface LabelItem {
  id: string;
  item_id: string | null;
  item_name: string;
  quantity: number;
  unit: string | null;
  instruction: string | null;
  dosage: string | null;
  dosage_qty: number | null;
  dosage_unit: string | null;
  frequency: string | null;
  duration: string | null;
  expiry: string | null;
}

const PRINT_STYLE_ID = 'drug-label-print-style';
const PRINT_ROOT_ID = 'print-root';

const PRINT_CSS = `
@media print {
  @page { size: 60mm 50mm; margin: 0; }
  html, body { margin: 0 !important; padding: 0 !important; background: #fff !important; }
  body * { visibility: hidden !important; }
  #${PRINT_ROOT_ID}, #${PRINT_ROOT_ID} * { visibility: visible !important; }
  #${PRINT_ROOT_ID} { position: absolute; left: 0; top: 0; display: block !important; }
}
@media screen { #${PRINT_ROOT_ID} { display: none; } }
`;

function composeInstructions(it: LabelItem): string {
  if (it.instruction && it.instruction.trim()) return it.instruction.trim();
  const parts: string[] = [];
  if (it.dosage_qty != null) {
    parts.push(`${it.dosage_qty}${it.dosage_unit ? ' ' + it.dosage_unit : ''}`);
  } else if (it.dosage) {
    parts.push(it.dosage);
  }
  if (it.frequency) {
    const label = FREQUENCY_LABELS?.[it.frequency as keyof typeof FREQUENCY_LABELS];
    parts.push(label ?? it.frequency);
  }
  if (it.duration) parts.push(`for ${it.duration}`);
  return parts.join(' ').trim() || '—';
}

export function DrugLabelPrintout({
  consultationId,
  patientName,
  open,
  onClose,
}: DrugLabelPrintoutProps) {
  const printedRef = useRef(false);
  const { settings } = useClinicSettings();
  const clinicName = settings?.clinic_name ?? 'Klinik Awfa';

  const { data, isLoading } = useQuery({
    queryKey: ['drug-labels', consultationId],
    enabled: open && !!consultationId,
    queryFn: async (): Promise<LabelItem[]> => {
      const { data: items, error } = await supabase
        .from('consultation_items')
        .select(
          `id, item_id, item_name, quantity, dosage, dosage_qty, dosage_unit,
           frequency, duration, instruction,
           inventory_items!inner ( id, category, unit_of_measure, uom )`,
        )
        .eq('consultation_id', consultationId)
        .is('deleted_at', null)
        .in('inventory_items.category', ['Medication', 'Vaccine']);
      if (error) throw error;

      const rows = (items ?? []) as Array<{
        id: string;
        item_id: string | null;
        item_name: string;
        quantity: number | null;
        dosage: string | null;
        dosage_qty: number | null;
        dosage_unit: string | null;
        frequency: string | null;
        duration: string | null;
        instruction: string | null;
        inventory_items: { unit_of_measure: string | null; uom: string | null } | null;
      }>;

      const itemIds = Array.from(
        new Set(rows.map((r) => r.item_id).filter((x): x is string => !!x)),
      );

      const expiryMap = new Map<string, string>();
      if (itemIds.length > 0) {
        const today = format(new Date(), 'yyyy-MM-dd');
        const { data: batches } = await supabase
          .from('inventory_item_batches')
          .select('inventory_item_id, expiry_date')
          .in('inventory_item_id', itemIds)
          .gte('expiry_date', today)
          .order('expiry_date', { ascending: true });
        for (const b of (batches ?? []) as Array<{ inventory_item_id: string; expiry_date: string }>) {
          if (!expiryMap.has(b.inventory_item_id)) expiryMap.set(b.inventory_item_id, b.expiry_date);
        }
      }

      return rows.map((r) => ({
        id: r.id,
        item_id: r.item_id,
        item_name: r.item_name,
        quantity: r.quantity ?? 0,
        unit: r.inventory_items?.unit_of_measure ?? r.inventory_items?.uom ?? null,
        instruction: r.instruction,
        dosage: r.dosage,
        dosage_qty: r.dosage_qty,
        dosage_unit: r.dosage_unit,
        frequency: r.frequency,
        duration: r.duration,
        expiry: r.item_id ? expiryMap.get(r.item_id) ?? null : null,
      }));
    },
  });

  // Inject print stylesheet once
  useEffect(() => {
    if (typeof document === 'undefined') return;
    if (document.getElementById(PRINT_STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = PRINT_STYLE_ID;
    style.innerHTML = PRINT_CSS;
    document.head.appendChild(style);
  }, []);

  // Ensure portal target exists
  const portalEl = useMemo(() => {
    if (typeof document === 'undefined') return null;
    let el = document.getElementById(PRINT_ROOT_ID);
    if (!el) {
      el = document.createElement('div');
      el.id = PRINT_ROOT_ID;
      document.body.appendChild(el);
    }
    return el;
  }, []);

  // Reset print guard when dialog reopens
  useEffect(() => {
    if (!open) printedRef.current = false;
  }, [open]);

  // Trigger print once data is loaded
  useEffect(() => {
    if (!open || isLoading || !data || printedRef.current) return;
    if (data.length === 0) {
      onClose();
      return;
    }
    printedRef.current = true;
    const handleAfter = () => {
      window.removeEventListener('afterprint', handleAfter);
      onClose();
    };
    window.addEventListener('afterprint', handleAfter);
    // Defer to next tick so React paints before the dialog opens
    const t = setTimeout(() => window.print(), 50);
    return () => {
      clearTimeout(t);
      window.removeEventListener('afterprint', handleAfter);
    };
  }, [open, isLoading, data, onClose]);

  if (!open || !portalEl || !data || data.length === 0) return null;

  const dispenseDate = format(new Date(), 'dd/MM/yy');

  return createPortal(
    <div className="bg-white text-black">
      {data.map((it) => (
        <div
          key={it.id}
          className="w-[60mm] h-[50mm] overflow-hidden flex flex-col justify-between p-2 leading-tight break-after-page"
          style={{ fontFamily: 'Arial, Helvetica, sans-serif', color: '#000', background: '#fff' }}
        >
          <div className="text-[8pt] font-bold text-center truncate">{clinicName}</div>

          <div className="flex items-baseline justify-between gap-1">
            <div className="text-[10pt] font-bold truncate flex-1">
              {patientName ?? 'Patient'}
            </div>
            <div className="text-[8pt] shrink-0">{dispenseDate}</div>
          </div>

          <div className="text-lg font-extrabold leading-tight line-clamp-2">
            {it.item_name}
            {it.quantity > 0 && (
              <span className="text-sm font-bold ml-1">
                × {it.quantity}
                {it.unit ? ' ' + it.unit : ''}
              </span>
            )}
          </div>

          <div className="text-sm font-bold leading-tight line-clamp-3">
            {composeInstructions(it)}
          </div>

          <div className="text-xs text-right">
            {it.expiry ? `EXP: ${format(new Date(it.expiry), 'MM/yyyy')}` : ''}
          </div>
        </div>
      ))}
    </div>,
    portalEl,
  );
}

export default DrugLabelPrintout;
