import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Pill, ExternalLink, Volume2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { StatusBadge } from '@/components/clinic/StatusBadge';
import { RoomPickerDialog } from '@/components/clinic/consultation/RoomPickerDialog';
import {
  useConsultationQueueEntries,
  useCallToDispensary,
} from '@/hooks/clinic/useQueueEntries';
import type { ClinicStatus, QueueEntryWithJoins } from '@/types/clinic';
import {
  bento,
  pageInner,
  pageShell,
  pillTabActive,
  pillTabIdle,
} from '@/lib/clinic/bentoTokens';

const tabs: Array<{ label: string; filter: ClinicStatus[] }> = [
  { label: 'Pending', filter: ['sent_to_dispensary'] },
  { label: 'In Progress', filter: ['dispensing_payment'] },
  { label: 'Completed', filter: ['completed'] },
];

export default function Dispensary() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('Pending');
  const { data: entries, isLoading } = useConsultationQueueEntries();
  const callToDispensary = useCallToDispensary();
  const [callTarget, setCallTarget] = useState<QueueEntryWithJoins | null>(null);

  const filtered = useMemo(() => {
    if (!entries) return [];
    const tab = tabs.find((t) => t.label === activeTab);
    return tab ? entries.filter((e) => tab.filter.includes(e.clinic_status)) : [];
  }, [entries, activeTab]);

  return (
    <div className={pageShell}>
      <div className={pageInner}>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Dispensary</h1>
          <p className="text-sm text-slate-500 mt-1">
            Open a patient to dispense items and process payment.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {tabs.map((tab) => {
            const count = entries?.filter((e) => tab.filter.includes(e.clinic_status)).length ?? 0;
            const isActive = activeTab === tab.label;
            return (
              <button
                key={tab.label}
                onClick={() => setActiveTab(tab.label)}
                className={cn(isActive ? pillTabActive : pillTabIdle, 'whitespace-nowrap')}
              >
                {tab.label}
                <span className={cn('ml-1.5', isActive ? 'text-blue-100' : 'text-slate-400')}>
                  ({count})
                </span>
              </button>
            );
          })}
        </div>

        <div className={cn(bento, 'overflow-hidden')}>
          <div className="grid grid-cols-5 gap-2 px-4 py-3 bg-slate-50">
            {['PATIENT', 'DOCTOR', 'ARRIVED', 'STATUS', 'ACTIONS'].map((col) => (
              <span
                key={col}
                className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider"
              >
                {col}
              </span>
            ))}
          </div>

          {isLoading ? (
            <div className="p-4 space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : !filtered.length ? (
            <div className="flex flex-col items-center justify-center py-20 text-slate-500">
              <Pill className="h-12 w-12 mb-3 opacity-20" />
              <p className="text-sm font-medium">No patients in this view</p>
              <p className="text-xs mt-1">
                Patients will appear here once sent to dispensary.
              </p>
            </div>
          ) : (
            filtered.map((entry) => {
              const isPending = entry.clinic_status === 'sent_to_dispensary';
              return (
                <div
                  key={entry.id}
                  className="grid grid-cols-5 gap-2 px-4 py-3 border-t border-slate-100 items-center hover:bg-slate-50/60 transition-colors"
                >
                  <span className="text-sm font-medium text-slate-800 truncate">
                    {entry.patients?.name ?? '—'}
                  </span>
                  <span className="text-sm text-slate-500">
                    {entry.doctors?.name || '—'}
                  </span>
                  <span className="text-sm text-slate-500">
                    {formatDistanceToNow(new Date(entry.created_at), { addSuffix: true })}
                  </span>
                  <StatusBadge status={entry.clinic_status} />
                  <div className="flex items-center gap-1">
                    {isPending && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 text-xs rounded-lg text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700"
                        onClick={() => setCallTarget(entry)}
                      >
                        <Volume2 className="h-3 w-3 mr-1" />
                        Call
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 text-xs rounded-lg text-blue-600 hover:bg-blue-50 hover:text-blue-700"
                      onClick={() =>
                        navigate(`/clinic/queue/checkout/${entry.id}`)
                      }
                    >
                      <ExternalLink className="h-3 w-3 mr-1" />
                      {isPending ? 'Start Payment' : 'Open'}
                    </Button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      <RoomPickerDialog
        open={!!callTarget}
        onOpenChange={(o) => !o && setCallTarget(null)}
        patientLabel={callTarget?.patients?.name ?? undefined}
        pending={callToDispensary.isPending}
        onConfirm={(roomId) => {
          if (!callTarget) return;
          callToDispensary.mutate(
            { id: callTarget.id, room_id: roomId },
            {
              onSuccess: () => {
                toast.success('Patient called to dispensary');
                setCallTarget(null);
              },
              onError: (err: unknown) => {
                const message = err instanceof Error ? err.message : 'Unknown error';
                toast.error(`Call failed: ${message}`);
              },
            },
          );
        }}
      />
    </div>
  );
}
