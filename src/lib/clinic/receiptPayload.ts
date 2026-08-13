import { format } from 'date-fns';
import type { ReceiptData } from '@/components/clinic/billing/ReceiptTemplate';
import { sumActiveBillingLines } from '@/lib/clinic/billingLedgerTotals';
import { calculateClinicalAge } from '@/lib/clinic/clinicalAge';
import { calculateDualLedger, sumPatientCollectibleBalance } from '@/lib/clinic/dualLedger';
import { formatQueueNo } from '@/lib/clinic/queueNumber';

export interface ReceiptPaymentSnapshot {
  id: string;
  batch_id: string | null;
  payment_method: string | null;
  payment_type: string | null;
  amount: number | null;
  created_at: string;
  queue_entry_id: string;
  consultation_id: string | null;
  deleted_at: string | null;
}

interface ReceiptQueueSnapshot {
  id: string;
  queue_sequence: number | null;
  created_at: string;
  patient: {
    name: string;
    national_id: string | null;
    date_of_birth: string | null;
  } | null;
}

interface ReceiptConsultationSnapshot {
  id: string;
  queue_entry_id: string;
}

interface ReceiptItemSnapshot {
  consultation_id: string;
  item_name: string;
  quantity: number | null;
  price: number | null;
}

interface ReceiptPanelClaimSnapshot {
  queue_entry_id: string;
  amount: number | null;
  received_amount: number | null;
  status: string | null;
}

export interface PaymentBatchReceiptSnapshot {
  payment: ReceiptPaymentSnapshot | null;
  receipt_id: string | null;
  selected_queue_entry_ids: string[] | null;
  payments: ReceiptPaymentSnapshot[] | null;
  ledger_payments: ReceiptPaymentSnapshot[] | null;
  queue_entries: ReceiptQueueSnapshot[] | null;
  consultations: ReceiptConsultationSnapshot[] | null;
  items: ReceiptItemSnapshot[] | null;
  panel_claims: ReceiptPanelClaimSnapshot[] | null;
}

function timestamp(value: string | null | undefined): number {
  const parsed = value ? new Date(value).getTime() : Number.NaN;
  return Number.isFinite(parsed) ? parsed : Number.MAX_SAFE_INTEGER;
}

export function buildReceiptData(snapshot: PaymentBatchReceiptSnapshot): ReceiptData | null {
  const clicked = snapshot.payment;
  if (!clicked) return null;

  const batchPayments = (snapshot.payments ?? []).filter((payment) => !payment.deleted_at);
  const receiptPayments = batchPayments.length > 0 ? batchPayments : [clicked];
  const ledgerPayments = (snapshot.ledger_payments ?? []).filter((payment) => !payment.deleted_at);
  const queueRows = snapshot.queue_entries ?? [];
  const queueMetadata = new Map(queueRows.map((queue) => [queue.id, queue]));
  const selectedIds = Array.from(new Set(
    (snapshot.selected_queue_entry_ids ?? []).filter(Boolean),
  ));
  if (selectedIds.length === 0) selectedIds.push(clicked.queue_entry_id);
  selectedIds.sort((left, right) => {
    const byDate = timestamp(queueMetadata.get(left)?.created_at)
      - timestamp(queueMetadata.get(right)?.created_at);
    return byDate || left.localeCompare(right);
  });

  const consultationQueue = new Map(
    (snapshot.consultations ?? []).map((consultation) => [consultation.id, consultation.queue_entry_id]),
  );
  const itemRows = snapshot.items ?? [];
  const invoiceGroups = selectedIds.map((queueEntryId, index) => {
    const rows = itemRows.filter((row) => consultationQueue.get(row.consultation_id) === queueEntryId);
    const items = rows.map((row) => {
      const quantity = Number(row.quantity ?? 0);
      const unitPrice = Number(row.price ?? 0);
      return {
        name: row.item_name,
        quantity,
        unit_price: unitPrice,
        line_total: sumActiveBillingLines([{ price: unitPrice, quantity }]),
      };
    });
    const metadata = queueMetadata.get(queueEntryId);
    const invoiceDate = metadata?.created_at
      ?? receiptPayments.find((payment) => payment.queue_entry_id === queueEntryId)?.created_at
      ?? clicked.created_at;
    const queueLabel = metadata?.queue_sequence == null
      ? `#${index + 1}`
      : formatQueueNo(invoiceDate, metadata.queue_sequence);
    return {
      id: queueEntryId,
      label: `Invoice ${queueLabel} · ${format(new Date(invoiceDate), 'dd MMM yyyy')}`,
      subtotal: sumActiveBillingLines(rows),
      items,
    };
  });

  const activeClaims = snapshot.panel_claims ?? [];
  const financials = invoiceGroups.map((group) => {
    const queuePayments = ledgerPayments.filter((payment) => payment.queue_entry_id === group.id);
    const queueClaims = activeClaims.filter((claim) => claim.queue_entry_id === group.id);
    return calculateDualLedger({
      billedTotal: group.subtotal,
      patientPayments: queuePayments
        .filter((payment) => payment.payment_method !== 'panel')
        .map((payment) => ({
          amount: Number(payment.amount ?? 0),
          paymentMethod: payment.payment_method,
        })),
      panelPayments: queuePayments.reduce((sum, payment) =>
        sum + (payment.payment_method === 'panel' ? Number(payment.amount ?? 0) : 0), 0),
      expectsPanel: queueClaims.length > 0 || queuePayments.some((payment) =>
        payment.payment_type === 'panel' || payment.payment_type === 'insurance'),
      panelClaim: queueClaims.length > 0 ? {
        amount: queueClaims.reduce((sum, claim) => sum + Number(claim.amount ?? 0), 0),
        receivedAmount: queueClaims.reduce(
          (sum, claim) => sum + Number(claim.received_amount ?? 0),
          0,
        ),
        status: String(queueClaims[0].status),
      } : null,
    });
  });

  const patientQueue = queueMetadata.get(clicked.queue_entry_id) ?? queueRows[0];
  const patient = patientQueue?.patient ?? null;
  const patientPortions = receiptPayments.filter((payment) => payment.payment_method !== 'panel');
  const items = invoiceGroups.flatMap((group) => group.items);
  const subtotal = invoiceGroups.reduce((sum, group) => sum + group.subtotal, 0);

  return {
    paymentId: clicked.id,
    receiptId: snapshot.receipt_id ?? clicked.batch_id ?? clicked.id,
    paymentMethod: clicked.payment_method,
    paymentType: clicked.payment_type,
    amountPaid: patientPortions.reduce((sum, payment) => sum + Number(payment.amount ?? 0), 0),
    paymentPortions: patientPortions.map((payment) => ({
      id: payment.id,
      method: payment.payment_method,
      amount: Number(payment.amount ?? 0),
    })),
    createdAt: clicked.created_at,
    queueLabel: invoiceGroups.length > 1
      ? `${invoiceGroups.length} invoices`
      : patientQueue?.queue_sequence == null
        ? null
        : formatQueueNo(patientQueue.created_at, patientQueue.queue_sequence),
    patientName: patient?.name ?? 'Walk-in',
    patientIc: patient?.national_id ?? null,
    patientAge: patient?.date_of_birth
      ? calculateClinicalAge(patient.date_of_birth).replace(/^Age:\s*/i, '')
      : undefined,
    items,
    invoiceGroups: invoiceGroups.length > 1 ? invoiceGroups : undefined,
    subtotal,
    invoiceTotal: subtotal,
    balanceRemaining: sumPatientCollectibleBalance(financials),
    panelBilled: financials.reduce((sum, ledger) => sum + ledger.panelCovered, 0),
    panelOutstanding: financials.reduce((sum, ledger) => sum + ledger.panelOutstanding, 0),
  };
}
