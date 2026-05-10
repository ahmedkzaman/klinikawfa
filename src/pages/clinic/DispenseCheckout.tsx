import { useEffect, useMemo, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, Info } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { StatusBadge } from '@/components/clinic/StatusBadge';
import { FollowUpScheduler } from '@/components/clinic/patient/FollowUpScheduler';
import { VisitDetailsColumn } from '@/components/clinic/visit/VisitDetailsColumn';
import { AttachmentsCard } from '@/components/clinic/visit/AttachmentsCard';
import { BillingDetailsColumn } from '@/components/clinic/visit/BillingDetailsColumn';
import { DispensePanel } from '@/components/clinic/visit/DispensePanel';
import {
  useConsultationQueueEntries,
  useUpdateQueueEntry,
} from '@/hooks/clinic/useQueueEntries';
import {
  useConsultation,
  useUpdateConsultation,
} from '@/hooks/clinic/useConsultations';
import { useConsultationLock } from '@/hooks/clinic/useConsultationLock';
import { ConsultationLockBanner } from '@/components/clinic/consultation/ConsultationLockBanner';
import { useConsultationItems } from '@/hooks/clinic/useConsultationItems';
import { usePayments } from '@/hooks/clinic/usePayments';
import { cn } from '@/lib/utils';
import {
  bento,
  bentoHeader,
  pageInner,
  pageShell,
  primaryBtn,
  secondaryBtn,
} from '@/lib/clinic/bentoTokens';

export default function DispenseCheckout() {
  const { queueEntryId } = useParams<{ queueEntryId: string }>();
  const navigate = useNavigate();

  const { data: entries = [], isLoading: entriesLoading } =
    useConsultationQueueEntries();
  const updateQueue = useUpdateQueueEntry();
  const updateConsultation = useUpdateConsultation();

  const entry = useMemo(
    () => entries.find((e) => e.id === queueEntryId),
    [entries, queueEntryId],
  );

  const { data: consultation } = useConsultation(queueEntryId);
  const { data: items = [] } = useConsultationItems(consultation?.id);
  const { data: payments = [] } = usePayments(queueEntryId);
  const { isLockedByOther, canEdit, forceUnlock } = useConsultationLock(
    consultation as
      | { id?: string; locked_by?: string | null; status?: string }
      | null
      | undefined,
  );

  const advancedRef = useRef(false);
  useEffect(() => {
    if (advancedRef.current) return;
    if (!entry || !queueEntryId) return;
    if (entry.clinic_status === 'sent_to_dispensary') {
      advancedRef.current = true;
      updateQueue.mutate({
        id: queueEntryId,
        clinic_status: 'dispensing_payment',
      });
    }
  }, [entry, queueEntryId, updateQueue]);

  const subtotal = useMemo(
    () =>
      items.reduce(
        (acc, item) =>
          acc + Number(item.price ?? 0) * Number(item.quantity ?? 0),
        0,
      ),
    [items],
  );
  const paid = useMemo(
    () => payments.reduce((acc, p) => acc + Number(p.amount ?? 0), 0),
    [payments],
  );
  const outstanding = Math.max(subtotal - paid, 0);

  const handleComplete = async () => {
    if (!queueEntryId || !consultation?.id) return;
    try {
      await updateConsultation.mutateAsync({
        id: consultation.id,
        status: 'completed',
      });
      await updateQueue.mutateAsync({
        id: queueEntryId,
        clinic_status: 'completed',
      });
      toast.success('Checkout completed');
      navigate('/clinic/dispensary');
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  if (entriesLoading) {
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
          <h2 className="text-lg font-semibold text-slate-800">Queue entry not found</h2>
          <p className="text-sm text-slate-500 mt-1">
            It may have been completed or cancelled.
          </p>
          <Button
            className={cn(secondaryBtn, 'mt-4')}
            onClick={() => navigate('/clinic/dispensary')}
          >
            <ArrowLeft className="h-4 w-4 mr-2" /> Back to Dispensary
          </Button>
        </div>
      </div>
    );
  }

  const patient = entry.patients;
  const dob = patient?.date_of_birth
    ? format(new Date(patient.date_of_birth), 'd MMM yyyy')
    : '—';

  return (
    <div className={pageShell}>
      <div className={cn(pageInner, 'pb-24')}>
        {/* Header */}
        <div className={cn(bento, 'flex items-center gap-3 flex-wrap p-4')}>
          <Button
            variant="ghost"
            size="sm"
            className="rounded-lg text-slate-600 hover:bg-slate-50"
            onClick={() => navigate('/clinic/dispensary')}
          >
            <ArrowLeft className="h-4 w-4 mr-1.5" /> Back
          </Button>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold text-slate-900 truncate">
              {patient?.name ?? 'Unknown patient'}
            </h1>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mt-0.5">
              Queue #{entry.queue_number ?? '—'} · Checkout
            </p>
          </div>
          <StatusBadge status={entry.clinic_status} />
        </div>

        {isLockedByOther && (
          <ConsultationLockBanner onForceUnlock={forceUnlock} />
        )}

        {/* 3-column workspace */}
        <div className="grid lg:grid-cols-[280px_1fr_360px] gap-4 items-start">
          {/* Patient summary */}
          <div className={cn(bento, 'p-4 space-y-3 text-sm')}>
            <h2 className={bentoHeader}>Patient</h2>
            <Field label="Name" value={patient?.name ?? '—'} />
            <Field label="IC / NRIC" value={patient?.national_id ?? '—'} />
            <Field label="Phone" value={patient?.phone ?? '—'} />
            <Field label="Date of Birth" value={dob} />
            <Field
              label="Gender"
              value={patient?.gender ? String(patient.gender) : '—'}
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
            </div>
          </div>

          {/* Items */}
          <div className="space-y-4">
            {consultation?.dispense_note?.trim() && (
              <Alert className="bg-amber-50 border-none rounded-2xl">
                <Info className="h-4 w-4 text-amber-700" />
                <AlertTitle className="text-amber-900 font-semibold">
                  Doctor's Instructions
                </AlertTitle>
                <AlertDescription className="whitespace-pre-wrap text-amber-900/90">
                  {consultation.dispense_note}
                </AlertDescription>
              </Alert>
            )}
            <VisitDetailsColumn
              consultationId={consultation?.id}
              canEdit={canEdit}
              patientName={patient?.name ?? null}
            />

            <AttachmentsCard consultationId={consultation?.id} />

            {(consultation?.patient_id || entry.patient_id) && (
              <FollowUpScheduler
                patientId={(consultation?.patient_id ?? entry.patient_id) as string}
                defaultDoctorId={consultation?.doctor_id ?? null}
              />
            )}
          </div>

          {/* Billing */}
          <BillingDetailsColumn
            queueEntryId={queueEntryId!}
            consultationId={consultation?.id ?? null}
            items={items}
            payments={payments}
          />
        </div>

        {/* Footer action */}
        <div className="fixed bottom-0 left-0 right-0 lg:left-60 z-30 bg-white/90 backdrop-blur-md border-t border-slate-100 px-4 md:px-6 py-3 flex items-center justify-end gap-3">
          <div className="text-sm text-slate-500 hidden sm:block">
            Outstanding:{' '}
            <span className="font-semibold text-slate-900 tabular-nums">
              RM {outstanding.toFixed(2)}
            </span>
          </div>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span>
                  <Button
                    className={primaryBtn}
                    onClick={handleComplete}
                    disabled={
                      outstanding > 0 ||
                      !consultation?.id ||
                      updateQueue.isPending ||
                      updateConsultation.isPending
                    }
                  >
                    <CheckCircle2 className="h-4 w-4 mr-2" />
                    Complete Checkout
                  </Button>
                </span>
              </TooltipTrigger>
              {outstanding > 0 && (
                <TooltipContent>
                  Settle outstanding balance before completing checkout.
                </TooltipContent>
              )}
              {!consultation?.id && (
                <TooltipContent>
                  No consultation found for this queue entry.
                </TooltipContent>
              )}
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>
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
