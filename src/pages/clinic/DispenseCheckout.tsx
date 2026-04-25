import { useEffect, useMemo, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, CheckCircle2 } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { StatusBadge } from '@/components/clinic/StatusBadge';
import { VisitDetailsColumn } from '@/components/clinic/visit/VisitDetailsColumn';
import { BillingDetailsColumn } from '@/components/clinic/visit/BillingDetailsColumn';
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

  // Auto-advance status once on mount.
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
  // Note: tax/discount live in BillingDetailsColumn; for the gate we use
  // the simple subtotal vs paid so users can override locally if needed.
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
      navigate('/clinic/procurement');
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  if (entriesLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <div className="grid lg:grid-cols-[280px_1fr_360px] gap-4">
          <Skeleton className="h-96" />
          <Skeleton className="h-96" />
          <Skeleton className="h-96" />
        </div>
      </div>
    );
  }

  if (!entry) {
    return (
      <div className="max-w-2xl mx-auto text-center py-20">
        <h2 className="text-lg font-semibold">Queue entry not found</h2>
        <p className="text-sm text-muted-foreground mt-1">
          It may have been completed or cancelled.
        </p>
        <Button
          variant="outline"
          className="mt-4"
          onClick={() => navigate('/clinic/procurement')}
        >
          <ArrowLeft className="h-4 w-4 mr-2" /> Back to Procurement
        </Button>
      </div>
    );
  }

  const patient = entry.patients;
  const dob = patient?.date_of_birth
    ? format(new Date(patient.date_of_birth), 'd MMM yyyy')
    : '—';

  return (
    <div className="space-y-4 max-w-7xl mx-auto pb-24">
      {/* Header */}
      <div className="flex items-center gap-3 flex-wrap">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate('/clinic/procurement')}
        >
          <ArrowLeft className="h-4 w-4 mr-1.5" /> Back
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-semibold truncate">
            {patient?.name ?? 'Unknown patient'}
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
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
        <div className="rounded-xl bg-card border p-4 space-y-3 text-sm">
          <h2 className="text-sm font-semibold border-b border-border pb-2">
            Patient
          </h2>
          <Field label="Name" value={patient?.name ?? '—'} />
          <Field label="IC / NRIC" value={patient?.national_id ?? '—'} />
          <Field label="Phone" value={patient?.phone ?? '—'} />
          <Field label="Date of Birth" value={dob} />
          <Field
            label="Gender"
            value={patient?.gender ? String(patient.gender) : '—'}
          />
          <div className="border-t border-border pt-2 mt-2">
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
        <VisitDetailsColumn consultationId={consultation?.id} />

        {/* Billing */}
        <BillingDetailsColumn
          queueEntryId={queueEntryId!}
          consultationId={consultation?.id ?? null}
          items={items}
          payments={payments}
        />
      </div>

      {/* Footer action */}
      <div className="fixed bottom-0 left-0 right-0 lg:left-60 z-30 bg-background/95 backdrop-blur border-t border-border px-4 md:px-6 py-3 flex items-center justify-end gap-3">
        <div className="text-sm text-muted-foreground hidden sm:block">
          Outstanding:{' '}
          <span className="font-semibold text-foreground tabular-nums">
            RM {outstanding.toFixed(2)}
          </span>
        </div>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <span>
                <Button
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
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm text-right text-foreground break-words max-w-[60%]">
        {value}
      </span>
    </div>
  );
}
