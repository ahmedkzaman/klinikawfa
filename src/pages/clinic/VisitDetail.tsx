import { useCallback, useMemo, useState } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusBadge } from '@/components/clinic/StatusBadge';
import { VisitDetailsColumn } from '@/components/clinic/visit/VisitDetailsColumn';
import { AttachmentsCard } from '@/components/clinic/visit/AttachmentsCard';
import { BillingDetailsColumn } from '@/components/clinic/visit/BillingDetailsColumn';
import { useQueueEntry } from '@/hooks/clinic/useQueueEntries';
import { useConsultation } from '@/hooks/clinic/useConsultations';
import { useConsultationItems } from '@/hooks/clinic/useConsultationItems';
import { usePayments } from '@/hooks/clinic/usePayments';
import { useCompletedBillCorrectionHistory } from '@/hooks/clinic/useCompletedBillCorrection';
import { useVisitPanelClaim } from '@/hooks/clinic/useVisitPanelClaim';
import { calculateDualLedger } from '@/lib/clinic/dualLedger';
import { parsePaymentVisitLocation } from '@/lib/clinic/paymentHistoryNavigation';
import { CompletedBillCorrectionDialog } from '@/components/clinic/visit/CompletedBillCorrectionDialog';
import { PatientVisitPaymentHistory } from '@/components/clinic/patient/PatientVisitPaymentHistory';
import { useAuth } from '@/contexts/AuthContext';
import { canCorrectCompletedBill, isCompletedForBillCorrection } from '@/lib/clinic/completedBillCorrection';
import { cn } from '@/lib/utils';
import { toMalayTitleCase } from '@/lib/textCase';
import { formatQueueNo } from '@/lib/clinic/queueNumber';
import { calculateClinicalAge } from '@/lib/clinic/clinicalAge';
import {
  bento,
  bentoHeader,
  pageInner,
  pageShell,
  secondaryBtn,
} from '@/lib/clinic/bentoTokens';

/**
 * Read-only visit detail page used for completed/paid records (e.g. opened
 * from Billings → Paid). Reuses the visit columns but does not advance any
 * queue/consultation status.
 */
export default function VisitDetail() {
  const { queueEntryId } = useParams<{ queueEntryId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { role } = useAuth();
  const [correctionOpen, setCorrectionOpen] = useState(false);
  const [, setBillingRevision] = useState(0);

  const { data: entry, isLoading } = useQueueEntry(queueEntryId);
  const { data: consultation } = useConsultation(queueEntryId);
  const { data: items = [], refetch: refetchItems } = useConsultationItems(consultation?.id);
  const { data: payments = [], refetch: refetchPayments } = usePayments(queueEntryId);
  const { data: panelClaim = null, refetch: refetchPanelClaim } = useVisitPanelClaim(queueEntryId);
  const { paymentId: focusedPaymentId } = useMemo(
    () => parsePaymentVisitLocation(location.search),
    [location.search],
  );
  const canCorrect =
    entry?.clinic_status === 'completed' &&
    isCompletedForBillCorrection(consultation) &&
    canCorrectCompletedBill(role);
  const canReadCorrectionHistory = canCorrectCompletedBill(role);
  const correctionHistory = useCompletedBillCorrectionHistory(
    canReadCorrectionHistory && entry?.clinic_status === 'completed' ? queueEntryId ?? null : null,
  );

  const refreshBilling = useCallback(async () => {
    const refreshes = [refetchItems(), refetchPayments(), refetchPanelClaim()];
    if (canReadCorrectionHistory) refreshes.push(correctionHistory.refetch());
    await Promise.all(refreshes);
    setBillingRevision((revision) => revision + 1);
  }, [canReadCorrectionHistory, correctionHistory, refetchItems, refetchPanelClaim, refetchPayments]);

  const subtotal = useMemo(
    () =>
      items.reduce(
        (acc, item) =>
          acc + Number(item.price ?? 0) * Number(item.quantity ?? 0),
        0,
      ),
    [items],
  );
  const financial = useMemo(() => calculateDualLedger({
    billedTotal: subtotal,
    patientPayments: payments.map((payment) => ({
      amount: Number(payment.amount ?? 0),
      deletedAt: payment.deleted_at,
      paymentMethod: payment.payment_method,
    })),
    panelPayments: payments
      .filter((payment) => payment.payment_method === 'panel')
      .reduce((sum, payment) => sum + Number(payment.amount ?? 0), 0),
    expectsPanel:
      entry?.payment_type === 'panel' ||
      entry?.payment_type === 'insurance' ||
      payments.some((payment) => payment.payment_type === 'panel' || payment.payment_type === 'insurance'),
    panelClaim: panelClaim ? {
      amount: panelClaim.amount,
      receivedAmount: panelClaim.receivedAmount,
      status: panelClaim.status,
    } : null,
  }), [entry?.payment_type, panelClaim, payments, subtotal]);

  if (isLoading) {
    return (
      <div className={pageShell}>
        <div className={cn(pageInner, 'space-y-4')}>
          <Skeleton className="h-10 w-64 rounded-xl" />
          <div className="grid lg:grid-cols-[280px_1fr_360px] gap-4">
            <Skeleton className="h-96 rounded-2xl" />
            <Skeleton className="h-96 rounded-2xl" />
            <Skeleton className="h-96 rounded-2xl" />
          </div>
        </div>
      </div>
    );
  }

  if (!entry) {
    return (
      <div className={pageShell}>
        <div className={cn(bento, 'max-w-2xl mx-auto text-center py-20 px-6')}>
          <h2 className="text-lg font-semibold text-slate-800">Visit not found</h2>
          <p className="text-sm text-slate-500 mt-1">
            This record may have been removed.
          </p>
          <Button
            className={cn(secondaryBtn, 'mt-4')}
            onClick={() => navigate('/clinic/billings')}
          >
            <ArrowLeft className="h-4 w-4 mr-2" /> Back to Billings
          </Button>
        </div>
      </div>
    );
  }

  const patient = entry.patients;
  const dob = patient?.date_of_birth
    ? `${format(new Date(patient.date_of_birth), 'd MMM yyyy')} (Age: ${calculateClinicalAge(patient.date_of_birth)})`
    : '—';

  return (
    <div className={pageShell}>
      <div className={cn(pageInner, 'pb-12')}>
        {/* Header */}
        <div className={cn(bento, 'flex items-center gap-3 flex-wrap p-4')}>
          <Button
            variant="ghost"
            size="sm"
            className="rounded-lg text-slate-600 hover:bg-slate-50"
            onClick={() => navigate(-1)}
          >
            <ArrowLeft className="h-4 w-4 mr-1.5" /> Back
          </Button>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold text-slate-900 truncate">
              {patient?.name ? toMalayTitleCase(patient.name) : 'Unknown patient'}
            </h1>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mt-0.5">
              Queue {formatQueueNo(entry.created_at, entry.queue_sequence)} · Visit record
            </p>
          </div>
          <StatusGroup label="Queue" status={entry.clinic_status} />
          {consultation?.status && (
            <StatusGroup label="Consultation" status={consultation.status} />
          )}
          {canCorrect && (
            <Button type="button" variant="outline" onClick={() => setCorrectionOpen(true)}>
              Edit completed bill
            </Button>
          )}
        </div>

        {/* 3-column workspace (read-only) */}
        <div className="grid lg:grid-cols-[280px_1fr_360px] gap-4 items-start">
          <div className={cn(bento, 'p-4 space-y-3 text-sm')}>
            <h2 className={bentoHeader}>Patient</h2>
            <Field label="Name" value={patient?.name ? toMalayTitleCase(patient.name) : '—'} />
            <Field label="IC / NRIC" value={patient?.national_id ?? '—'} />
            <Field label="Phone" value={patient?.phone ?? '—'} />
            <Field label="Date of Birth" value={dob} />
            <Field
              label="Gender"
              value={patient?.gender ? String(patient.gender) : '—'}
            />
            <PatientVisitPaymentHistory
              patientId={entry.patient_id}
              currentQueueEntryId={queueEntryId}
            />
            <div className="border-t border-slate-100 pt-3 mt-3 space-y-3">
              <Field
                label="Doctor"
                value={
                  (consultation as { doctors?: { name?: string } } | undefined)
                    ?.doctors?.name ??
                  entry.doctors?.name ??
                  '—'
                }
              />
              <Field
                label="Diagnosis"
                value={
                  consultation?.diagnosis_text?.trim() ||
                  (consultation as { diagnoses?: { name?: string } } | undefined)
                    ?.diagnoses?.name ||
                  '—'
                }
              />
              <Field
                label="Patient outstanding"
                value={`RM ${financial.patientOutstanding.toFixed(2)}`}
              />
            </div>
          </div>

          <div className="space-y-4">
            <VisitDetailsColumn
              consultationId={consultation?.id}
              canEdit={false}
              patientName={patient?.name ?? null}
              patientDob={patient?.date_of_birth ?? null}
            />
            <AttachmentsCard consultationId={consultation?.id} />
            {canReadCorrectionHistory && (
              <section className={cn(bento, 'p-4 space-y-3')} aria-labelledby="bill-correction-history-heading">
                <h2 id="bill-correction-history-heading" className={bentoHeader}>Bill correction history</h2>
                {correctionHistory.isError ? (
                  <p role="alert" className="text-sm text-muted-foreground">Correction history is currently unavailable.</p>
                ) : correctionHistory.isLoading ? (
                  <p className="text-sm text-muted-foreground">Loading correction history…</p>
                ) : correctionHistory.data?.length ? (
                  <div className="space-y-3">
                    {correctionHistory.data.map((correction) => (
                      <article key={correction.id} className="rounded-lg border border-slate-100 p-3 text-sm space-y-1">
                        <p className="font-medium text-slate-800">{correction.reason}</p>
                        <p className="text-xs text-slate-500">Actor: {correction.actorId}</p>
                        <p className="text-xs text-slate-500">{format(new Date(correction.createdAt), 'd MMM yyyy, h:mm a')}</p>
                        <p className="text-sm text-slate-700 tabular-nums">RM {correction.beforeTotal.toFixed(2)} → RM {correction.afterTotal.toFixed(2)}</p>
                      </article>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No bill corrections have been recorded.</p>
                )}
              </section>
            )}
          </div>

          <BillingDetailsColumn
            queueEntryId={queueEntryId!}
            consultationId={consultation?.id ?? null}
            items={items}
            payments={payments}
            focusedPaymentId={focusedPaymentId}
            panelClaim={panelClaim}
            expectsPanel={
              entry.payment_type === 'panel' ||
              entry.payment_type === 'insurance' ||
              payments.some((payment) => payment.payment_type === 'panel' || payment.payment_type === 'insurance')
            }
          />
        </div>
      </div>
      {canCorrect && queueEntryId && (
        <CompletedBillCorrectionDialog
          queueEntryId={queueEntryId}
          open={correctionOpen}
          onOpenChange={setCorrectionOpen}
          onCorrected={refreshBilling}
        />
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-2">
      <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
        {label}
      </span>
      <span className="text-sm text-right text-slate-800 break-words max-w-[60%]">
        {value}
      </span>
    </div>
  );
}

function StatusGroup({ label, status }: { label: string; status: string }) {
  return (
    <div className="inline-flex items-center gap-1.5">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
        {label}:
      </span>
      <StatusBadge status={status as Parameters<typeof StatusBadge>[0]['status']} />
    </div>
  );
}
