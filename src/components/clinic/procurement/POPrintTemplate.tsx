import { format } from 'date-fns';
import { useClinicSettings } from '@/hooks/clinic/useClinicSettings';
import type { PurchaseOrderDetail } from '@/hooks/clinic/usePurchaseOrders';
import type { Supplier } from '@/hooks/clinic/useSuppliers';

interface Props {
  po: PurchaseOrderDetail;
  supplier?: Supplier | null;
}

export function POPrintTemplate({ po, supplier }: Props) {
  const { settings } = useClinicSettings();
  const total = (po.items ?? []).reduce((s, l) => s + Number(l.total_price ?? 0), 0);

  return (
    <div
      className="po-print-root hidden print:block print:fixed print:inset-0 print:bg-white print:text-black print:p-10 print:text-[12pt]"
      style={{ colorScheme: 'light' }}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-6 pb-4 border-b-2 border-black">
        <div className="flex items-start gap-3">
          {settings.logo_url ? (
            <img
              src={settings.logo_url}
              alt={settings.clinic_name}
              style={{ height: `${settings.logo_height_px ?? 64}px` }}
              className="w-auto object-contain"
              crossOrigin="anonymous"
            />
          ) : null}
          <div style={{ fontSize: `${settings.letterhead_text_px ?? 12}px`, lineHeight: 1.3 }}>
            <div className="font-bold" style={{ fontSize: `${Math.round((settings.letterhead_text_px ?? 12) * 1.4)}px` }}>
              {settings.clinic_name || 'Klinik Awfa'}
            </div>
            {settings.address_line_1 && <div>{settings.address_line_1}</div>}
            {settings.address_line_2 && <div>{settings.address_line_2}</div>}
            {settings.phone && <div>Tel: {settings.phone}</div>}
            {settings.email && <div>{settings.email}</div>}
          </div>
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold tracking-widest">PURCHASE ORDER</div>
          <div className="mt-2 text-xs">
            <div><span className="font-semibold">PO No:</span> {po.po_number}</div>
            <div><span className="font-semibold">Order Date:</span> {po.order_date ? format(new Date(po.order_date), 'dd MMM yyyy') : '—'}</div>
            {po.expected_date && (
              <div><span className="font-semibold">Expected:</span> {format(new Date(po.expected_date), 'dd MMM yyyy')}</div>
            )}
            <div><span className="font-semibold">Status:</span> {po.status}</div>
          </div>
        </div>
      </div>

      {/* Content (margin tunable from settings) */}
      <div style={{ paddingTop: `${settings.content_margin_top}px` }}>
        {/* Vendor */}
        <div className="mb-6">
          <div className="text-xs font-semibold uppercase tracking-wide text-gray-700">To:</div>
          <div className="mt-1">
            <div className="font-semibold">{supplier?.name ?? '—'}</div>
            {supplier?.contact_person && <div className="text-xs">Attn: {supplier.contact_person}</div>}
            {supplier?.phone && <div className="text-xs">Tel: {supplier.phone}</div>}
            {supplier?.email && <div className="text-xs">{supplier.email}</div>}
          </div>
        </div>

        {/* Line Items */}
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr>
              <th className="border border-black px-2 py-1 text-left w-8">No</th>
              <th className="border border-black px-2 py-1 text-left">Item Description</th>
              <th className="border border-black px-2 py-1 text-right w-16">Qty</th>
              <th className="border border-black px-2 py-1 text-right w-28">Unit Cost (RM)</th>
              <th className="border border-black px-2 py-1 text-right w-28">Total (RM)</th>
            </tr>
          </thead>
          <tbody>
            {po.items.map((line, idx) => (
              <tr key={line.id}>
                <td className="border border-black px-2 py-1">{idx + 1}</td>
                <td className="border border-black px-2 py-1">{line.inventory_item?.name ?? '—'}</td>
                <td className="border border-black px-2 py-1 text-right">{line.order_qty}</td>
                <td className="border border-black px-2 py-1 text-right">{Number(line.unit_cost).toFixed(2)}</td>
                <td className="border border-black px-2 py-1 text-right">{Number(line.total_price).toFixed(2)}</td>
              </tr>
            ))}
            {po.items.length === 0 && (
              <tr>
                <td colSpan={5} className="border border-black px-2 py-3 text-center italic">
                  No items
                </td>
              </tr>
            )}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={4} className="border border-black px-2 py-1 text-right font-bold">
                GRAND TOTAL (RM)
              </td>
              <td className="border border-black px-2 py-1 text-right font-bold">
                {total.toFixed(2)}
              </td>
            </tr>
          </tfoot>
        </table>

        {po.notes && (
          <div className="mt-4 text-xs italic">
            <span className="font-semibold not-italic">Notes:</span> {po.notes}
          </div>
        )}

        {/* Signatures */}
        <div className="mt-16 grid grid-cols-2 gap-12 text-xs">
          <div>
            <div className="border-t border-black pt-1">Prepared By</div>
          </div>
          <div>
            <div className="border-t border-black pt-1">Authorized Signature & Clinic Stamp</div>
          </div>
        </div>

        <div className="mt-8 text-[10px] text-gray-600 text-center">
          Generated on {format(new Date(), 'dd MMM yyyy, HH:mm')}
        </div>
      </div>
    </div>
  );
}
