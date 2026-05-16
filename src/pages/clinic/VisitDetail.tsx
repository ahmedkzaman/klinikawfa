import { useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
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
import { cn } from '@/lib/utils';
import { toMalayTitleCase } from '@/lib/textCase';
import { formatQueueNo } from '@/lib/clinic/queueNumber';
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

  const { data: entry, isLoading } = useQueueEntry(queueEntryId);
  const { data: consultation } = useConsultation(queueEntryId);
  const { data: items = [] } = useConsultationItems(consultation?.id);
  const { data: payments = [] } = usePayments(queueEntryId);

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
    ? format(new Date(patient.date_of_birth), 'd MMM yyyy')
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
          <StatusBadge status={entry.clinic_status} />
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
                label="Outstanding"
                value={`RM ${outstanding.toFixed(2)}`}
              />
            </div>
          </div>

          <div className="space-y-4">
            <VisitDetailsColumn
              consultationId={consultation?.id}
              canEdit={false}
              patientName={patient?.name ?? null}
            />
            <AttachmentsCard consultationId={consultation?.id} />
          </div>

          <BillingDetailsColumn
            queueEntryId={queueEntryId!}
            consultationId={consultation?.id ?? null}
            items={items}
            payments={payments}
          />
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
