import { format } from 'date-fns';
import { formatPaymentMethod } from '@/lib/clinic/paymentMethod';
import type { ClinicSettings } from '@/hooks/clinic/useClinicSettings';

export interface ReceiptItem {
  name: string;
  quantity: number;
  unit_price: number;
  line_total: number;
}

export interface ReceiptData {
  paymentId: string;
  paymentMethod: string | null;
  paymentType: string | null;
  amountPaid: number;
  createdAt: string;
  queueLabel: string | null;
  patientName: string;
  patientIc: string | null;
  items: ReceiptItem[];
  subtotal: number;
  grandTotal: number;
}

interface Props {
  data: ReceiptData;
  settings: ClinicSettings;
}

export function ReceiptTemplate({ data, settings }: Props) {
  const shortId = data.paymentId.slice(0, 8).toUpperCase();
  const dt = new Date(data.createdAt);
  const sst = settings.sst_number?.trim() || '';
  const baseTextPx = settings.letterhead_text_px ?? 12;
  const titlePx = Math.round(baseTextPx * 1.4);
  const discount = Math.max(0, data.subtotal - data.amountPaid);

  return (
    <div
      className="print-container max-w-2xl mx-auto bg-white text-black p-8"
      style={{ colorScheme: 'light' }}
    >
      {/* Letterhead */}
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
          <div style={{ fontSize: `${baseTextPx}px`, lineHeight: 1.3 }}>
            <div className="font-bold" style={{ fontSize: `${titlePx}px` }}>
              {settings.clinic_name || 'Klinik Awfa'}
            </div>
            {settings.address_line_1 && <div>{settings.address_line_1}</div>}
            {settings.address_line_2 && <div>{settings.address_line_2}</div>}
            {settings.phone && <div>Tel: {settings.phone}</div>}
            {settings.email && <div>{settings.email}</div>}
            {sst && <div>SST No: {sst}</div>}
          </div>
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold tracking-widest">
            OFFICIAL RECEIPT
          </div>
          <div className="mt-2 text-xs space-y-0.5">
            <div>
              <span className="font-semibold">Receipt No:</span> {shortId}
            </div>
            <div>
              <span className="font-semibold">Date:</span>{' '}
              {format(dt, 'dd MMM yyyy, h:mm a')}
            </div>
            {data.queueLabel && (
              <div>
                <span className="font-semibold">Queue:</span> {data.queueLabel}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Content */}
      <div style={{ paddingTop: `${settings.content_margin_top ?? 24}px` }}>
        {/* Patient */}
        <div className="mb-6">
          <div className="text-xs font-semibold uppercase tracking-wide text-gray-700">
            Received From:
          </div>
          <div className="mt-1 text-sm">
            <div className="font-semibold">{data.patientName}</div>
            {data.patientIc && (
              <div className="text-xs">IC/ID: {data.patientIc}</div>
            )}
          </div>
        </div>

        {/* Items */}
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr>
              <th className="border border-black px-2 py-1 text-left w-8">No</th>
              <th className="border border-black px-2 py-1 text-left">Item</th>
              <th className="border border-black px-2 py-1 text-right w-16">Qty</th>
              <th className="border border-black px-2 py-1 text-right w-28">
                Unit Price (RM)
              </th>
              <th className="border border-black px-2 py-1 text-right w-28">
                Total (RM)
              </th>
            </tr>
          </thead>
          <tbody>
            {data.items.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  className="border border-black px-2 py-3 text-center italic"
                >
                  No itemised entries
                </td>
              </tr>
            ) : (
              data.items.map((line, idx) => (
                <tr key={idx}>
                  <td className="border border-black px-2 py-1 align-top">
                    {idx + 1}
                  </td>
                  <td className="border border-black px-2 py-1 align-top">
                    {line.name}
                  </td>
                  <td className="border border-black px-2 py-1 text-right align-top tabular-nums">
                    {line.quantity}
                  </td>
                  <td className="border border-black px-2 py-1 text-right align-top tabular-nums">
                    {line.unit_price.toFixed(2)}
                  </td>
                  <td className="border border-black px-2 py-1 text-right align-top tabular-nums">
                    {line.line_total.toFixed(2)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
          <tfoot>
            {data.items.length > 0 && (
              <tr>
                <td
                  colSpan={4}
                  className="border border-black px-2 py-1 text-right"
                >
                  Subtotal (RM)
                </td>
                <td className="border border-black px-2 py-1 text-right tabular-nums">
                  {data.subtotal.toFixed(2)}
                </td>
              </tr>
            )}
            {discount > 0 && (
              <tr>
                <td
                  colSpan={4}
                  className="border border-black px-2 py-1 text-right"
                >
                  Discount / Adjustment (RM)
                </td>
                <td className="border border-black px-2 py-1 text-right tabular-nums">
                  -{discount.toFixed(2)}
                </td>
              </tr>
            )}
            <tr>
              <td
                colSpan={4}
                className="border border-black px-2 py-1 text-right font-bold"
              >
                GRAND TOTAL (RM)
              </td>
              <td className="border border-black px-2 py-1 text-right font-bold tabular-nums">
                {data.amountPaid.toFixed(2)}
              </td>
            </tr>
          </tfoot>
        </table>

        {/* Payment */}
        <div className="mt-6 border border-black p-3 text-xs">
          <div>
            <span className="font-semibold">Paid via:</span>{' '}
            {formatPaymentMethod(data.paymentMethod, data.amountPaid)}
          </div>
          <div>
            <span className="font-semibold">Amount Received:</span>{' '}
            <span className="tabular-nums">
              RM {data.amountPaid.toFixed(2)}
            </span>
          </div>
        </div>

        {/* Signatures */}
        <div className="mt-12 grid grid-cols-2 gap-12 text-xs">
          <div>
            <div className="border-t border-black pt-1">Received By</div>
          </div>
          <div>
            <div className="border-t border-black pt-1">
              Authorized Signature & Clinic Stamp
            </div>
          </div>
        </div>

        <div className="mt-8 text-[10px] text-gray-600 text-center">
          Generated on {format(new Date(), 'dd MMM yyyy, HH:mm')} — Thank you
          for your visit.
        </div>
      </div>
    </div>
  );
}
