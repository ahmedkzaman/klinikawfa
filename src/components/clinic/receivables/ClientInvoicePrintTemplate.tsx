import { format } from 'date-fns';
import { useClinicSettings } from '@/hooks/clinic/useClinicSettings';
import type { ClientInvoiceDetail } from '@/hooks/clinic/useClientInvoices';

interface Props {
  invoice: ClientInvoiceDetail;
}

export function ClientInvoicePrintTemplate({ invoice }: Props) {
  const { settings } = useClinicSettings();
  const sst = settings.sst_number?.trim() || '';
  const isTaxInvoice = sst.length > 0;
  const total = (invoice.items ?? []).reduce(
    (s, l) => s + Number(l.total_price ?? 0),
    0,
  );

  return (
    <div
      className="client-invoice-print-root hidden print:block print:fixed print:inset-0 print:bg-white print:text-black print:p-10 print:text-[12pt]"
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
            <div
              className="font-bold"
              style={{ fontSize: `${Math.round((settings.letterhead_text_px ?? 12) * 1.4)}px` }}
            >
              {settings.clinic_name || 'Klinik Awfa'}
            </div>
            {settings.address_line_1 && <div>{settings.address_line_1}</div>}
            {settings.address_line_2 && <div>{settings.address_line_2}</div>}
            {settings.phone && <div>Tel: {settings.phone}</div>}
            {settings.email && <div>{settings.email}</div>}
            {isTaxInvoice && <div>SST No: {sst}</div>}
          </div>
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold tracking-widest">
            {isTaxInvoice ? 'TAX INVOICE' : 'INVOICE'}
          </div>
          <div className="mt-2 text-xs">
            <div><span className="font-semibold">Invoice No:</span> {invoice.invoice_no}</div>
            <div>
              <span className="font-semibold">Issue Date:</span>{' '}
              {invoice.issue_date ? format(new Date(invoice.issue_date), 'dd MMM yyyy') : '—'}
            </div>
            {invoice.due_date && (
              <div>
                <span className="font-semibold">Due Date:</span>{' '}
                {format(new Date(invoice.due_date), 'dd MMM yyyy')}
              </div>
            )}
            <div><span className="font-semibold">Status:</span> {invoice.status}</div>
          </div>
        </div>
      </div>

      {/* Content (margin tunable from settings) */}
      <div style={{ paddingTop: `${settings.content_margin_top}px` }}>
        {/* Bill To */}
        <div className="mb-6">
          <div className="text-xs font-semibold uppercase tracking-wide text-gray-700">
            Bill To:
          </div>
          <div className="mt-1">
            <div className="font-semibold">{invoice.client?.name ?? '—'}</div>
            {invoice.client?.address && (
              <div className="text-xs whitespace-pre-line">{invoice.client.address}</div>
            )}
            {invoice.client?.contact_person && (
              <div className="text-xs">Attn: {invoice.client.contact_person}</div>
            )}
            {invoice.client?.phone && <div className="text-xs">Tel: {invoice.client.phone}</div>}
            {invoice.client?.email && <div className="text-xs">{invoice.client.email}</div>}
          </div>
        </div>

        {/* Line Items */}
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr>
              <th className="border border-black px-2 py-1 text-left w-8">No</th>
              <th className="border border-black px-2 py-1 text-left">Description</th>
              <th className="border border-black px-2 py-1 text-right w-20">Qty</th>
              <th className="border border-black px-2 py-1 text-right w-28">Unit Price (RM)</th>
              <th className="border border-black px-2 py-1 text-right w-28">Total (RM)</th>
            </tr>
          </thead>
          <tbody>
            {invoice.items.map((line, idx) => (
              <tr key={line.id}>
                <td className="border border-black px-2 py-1 align-top">{idx + 1}</td>
                <td className="border border-black px-2 py-1 align-top whitespace-pre-line">
                  {line.description}
                </td>
                <td className="border border-black px-2 py-1 text-right align-top">
                  {Number(line.quantity).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                </td>
                <td className="border border-black px-2 py-1 text-right align-top">
                  {Number(line.unit_price).toFixed(2)}
                </td>
                <td className="border border-black px-2 py-1 text-right align-top">
                  {Number(line.total_price).toFixed(2)}
                </td>
              </tr>
            ))}
            {invoice.items.length === 0 && (
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

        {invoice.notes && (
          <div className="mt-4 text-xs">
            <span className="font-semibold">Notes:</span>{' '}
            <span className="italic whitespace-pre-line">{invoice.notes}</span>
          </div>
        )}

        {invoice.status === 'Paid' && invoice.payment_ref && (
          <div className="mt-4 text-xs">
            <span className="font-semibold">Payment Ref:</span> {invoice.payment_ref}
          </div>
        )}

        {/* Bank details */}
        <div className="mt-8 border border-black p-3 text-xs">
          <div className="font-semibold uppercase tracking-wide mb-1">Payment Instructions</div>
          <div>Make payment to <span className="font-semibold">Klinik Awfa</span></div>
          <div>Bank: [Bank Name] · Account No: [Account Number]</div>
          <div>Please quote invoice no. <span className="font-semibold">{invoice.invoice_no}</span> as payment reference.</div>
        </div>

        {/* Signatures */}
        <div className="mt-12 grid grid-cols-2 gap-12 text-xs">
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
