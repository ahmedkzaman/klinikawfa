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

  return (
    <div className="print-container max-w-md mx-auto bg-white text-black p-4 font-mono text-xs leading-snug">
      <div className="text-center space-y-0.5">
        {settings.logo_url ? (
          <img
            src={settings.logo_url}
            alt={settings.clinic_name}
            className="mx-auto mb-1"
            style={{ height: 48 }}
          />
        ) : null}
        <div className="text-sm font-bold uppercase tracking-wide">
          {settings.clinic_name}
        </div>
        {settings.address_line_1 && <div>{settings.address_line_1}</div>}
        {settings.address_line_2 && <div>{settings.address_line_2}</div>}
        {settings.phone && <div>Tel: {settings.phone}</div>}
      </div>

      <hr className="border-t border-dashed border-black my-2" />

      <div className="space-y-0.5">
        <Line label="Receipt" value={`#${shortId}`} />
        <Line label="Date" value={format(dt, 'dd MMM yyyy, h:mm a')} />
        {data.queueLabel && <Line label="Queue" value={data.queueLabel} />}
        <Line label="Patient" value={data.patientName} />
        {data.patientIc && <Line label="IC" value={data.patientIc} />}
      </div>

      <hr className="border-t border-dashed border-black my-2" />

      <div className="grid grid-cols-[1fr_auto_auto] gap-x-2 font-semibold">
        <span>Item</span>
        <span className="text-right">Qty</span>
        <span className="text-right w-16">Total</span>
      </div>
      <div className="mt-1 space-y-1">
        {data.items.length === 0 ? (
          <div className="text-center italic opacity-70">
            (No itemised entries)
          </div>
        ) : (
          data.items.map((it, i) => (
            <div
              key={i}
              className="grid grid-cols-[1fr_auto_auto] gap-x-2 tabular-nums"
            >
              <span className="break-words">{it.name}</span>
              <span className="text-right">{it.quantity}</span>
              <span className="text-right w-16">
                {it.line_total.toFixed(2)}
              </span>
            </div>
          ))
        )}
      </div>

      <hr className="border-t border-dashed border-black my-2" />

      <div className="space-y-0.5">
        <Line label="Subtotal" value={`RM ${data.subtotal.toFixed(2)}`} />
        <Line
          label="Grand Total"
          value={`RM ${data.grandTotal.toFixed(2)}`}
          bold
        />
      </div>

      <hr className="border-t border-dashed border-black my-2" />

      <div className="space-y-0.5">
        <Line
          label="Paid via"
          value={formatPaymentMethod(data.paymentMethod, data.amountPaid)}
        />
        <Line
          label="Amount"
          value={`RM ${data.amountPaid.toFixed(2)}`}
          bold
        />
      </div>

      <hr className="border-t border-dashed border-black my-2" />

      <div className="text-center mt-3 space-y-0.5">
        <div className="font-semibold">Thank you for your visit</div>
        <div>Get well soon</div>
      </div>
    </div>
  );
}

function Line({
  label,
  value,
  bold,
}: {
  label: string;
  value: string;
  bold?: boolean;
}) {
  return (
    <div className="flex justify-between gap-2">
      <span className={bold ? 'font-bold' : ''}>{label}</span>
      <span className={`tabular-nums ${bold ? 'font-bold' : ''}`}>{value}</span>
    </div>
  );
}
