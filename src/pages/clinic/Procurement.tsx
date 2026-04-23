import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Pill, ExternalLink } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { StatusBadge } from '@/components/clinic/StatusBadge';
import { useConsultationQueueEntries } from '@/hooks/clinic/useQueueEntries';
import type { ClinicStatus } from '@/types/clinic';

const tabs: Array<{ label: string; filter: ClinicStatus[] }> = [
  { label: 'Pending', filter: ['sent_to_dispensary'] },
  { label: 'In Progress', filter: ['dispensing_payment'] },
  { label: 'Completed', filter: ['completed'] },
];

export default function Procurement() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('Pending');
  const { data: entries, isLoading } = useConsultationQueueEntries();

  const filtered = useMemo(() => {
    if (!entries) return [];
    const tab = tabs.find((t) => t.label === activeTab);
    return tab ? entries.filter((e) => tab.filter.includes(e.clinic_status)) : [];
  }, [entries, activeTab]);

  return (
    <div className="space-y-5 max-w-7xl mx-auto">
      <div>
        <h1 className="text-2xl font-semibold">Procurement</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Open a patient to dispense items and process payment.
        </p>
      </div>

      <div className="flex items-center gap-1 border-b border-border overflow-x-auto">
        {tabs.map((tab) => (
          <button
            key={tab.label}
            onClick={() => setActiveTab(tab.label)}
            className={cn(
              'px-3 py-2 text-sm font-medium whitespace-nowrap border-b-2 transition-colors duration-200',
              activeTab === tab.label
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {tab.label}
            {entries && (
              <span className="ml-1.5 text-xs text-muted-foreground">
                ({entries.filter((e) => tab.filter.includes(e.clinic_status)).length})
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="rounded-xl bg-card border overflow-hidden">
        <div className="grid grid-cols-5 gap-2 px-4 py-3 border-b border-border">
          {['PATIENT', 'DOCTOR', 'ARRIVED', 'STATUS', 'ACTIONS'].map((col) => (
            <span
              key={col}
              className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider"
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
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
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
                className="grid grid-cols-5 gap-2 px-4 py-3 border-b border-border last:border-0 items-center hover:bg-muted/50 transition-colors"
              >
                <span className="text-sm font-medium text-foreground truncate">
                  {entry.patients?.name ?? '—'}
                </span>
                <span className="text-sm text-muted-foreground">
                  {entry.doctors?.name || '—'}
                </span>
                <span className="text-sm text-muted-foreground">
                  {formatDistanceToNow(new Date(entry.created_at), { addSuffix: true })}
                </span>
                <StatusBadge status={entry.clinic_status} />
                <div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs"
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
  );
}
