import { format } from 'date-fns';
import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import {
  usePatientVisitPaymentHistory,
  type PatientVisitPaymentHistoryItem,
} from '@/hooks/clinic/usePatientVisitPaymentHistory';
import { paymentVisitPath } from '@/lib/clinic/paymentHistoryNavigation';
import { cn } from '@/lib/utils';

interface Props {
  patientId: string | null | undefined;
  currentQueueEntryId?: string | null;
}

export function PatientVisitPaymentHistory({
  patientId,
  currentQueueEntryId = null,
}: Props) {
  const history = usePatientVisitPaymentHistory(patientId);
  const visits = (history.data ?? []).filter(
    (visit) => visit.queueEntryId !== currentQueueEntryId,
  );

  if (!patientId) return null;

  return (
    <section className="border-t border-slate-100 pt-3 mt-3 space-y-2">
      <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
        Previous bill history
      </h3>
      {history.isLoading ? (
        <p className="text-xs text-slate-500">Loading previous bills...</p>
      ) : history.isError ? (
        <p role="alert" className="text-xs text-destructive">
          Previous bill history is unavailable.
        </p>
      ) : visits.length ? (
        <div className="space-y-2">
          {visits.map((visit) => (
            <HistoryRow key={visit.queueEntryId} visit={visit} />
          ))}
        </div>
      ) : (
        <p className="text-xs text-slate-500">No previous bill history found.</p>
      )}
    </section>
  );
}

function HistoryRow({ visit }: { visit: PatientVisitPaymentHistoryItem }) {
  const firstPaymentId = visit.payments[0]?.id;
  const outstanding = visit.patientOutstanding + visit.panelOutstanding;

  return (
    <article className="rounded-lg border border-slate-100 p-2.5 text-xs space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-semibold text-slate-800">{visit.queueLabel}</p>
          <p className="text-slate-500">
            {format(new Date(visit.visitDate), 'd MMM yyyy')}
          </p>
        </div>
        <Badge
          variant="outline"
          className={cn(
            'text-[10px]',
            outstanding > 0
              ? 'border-amber-200 bg-amber-50 text-amber-700'
              : 'border-emerald-200 bg-emerald-50 text-emerald-700',
          )}
        >
          {outstanding > 0 ? 'Outstanding' : 'Settled'}
        </Badge>
      </div>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 tabular-nums text-slate-600">
        <Metric label="Total" value={visit.total} />
        <Metric label="Patient paid" value={visit.patientPaid} />
        <Metric label="Panel received" value={visit.panelReceived} />
        <Metric label="Outstanding" value={outstanding} />
      </dl>
      <Link
        to={paymentVisitPath(visit.queueEntryId, firstPaymentId)}
        className="inline-flex text-xs font-semibold text-primary hover:underline"
      >
        View visit {visit.queueLabel}
      </Link>
    </article>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt className="text-slate-500">{label}</dt>
      <dd className="font-semibold text-slate-800">RM {value.toFixed(2)}</dd>
    </div>
  );
}
