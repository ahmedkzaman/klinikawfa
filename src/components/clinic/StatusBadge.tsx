import { cn } from '@/lib/utils';
import { STATUS_COLORS, STATUS_LABELS, type ClinicStatus } from '@/types/clinic';

const baseClass =
  'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border';

export function StatusBadge({ status }: { status: ClinicStatus }) {
  const className = STATUS_COLORS[status] ?? 'bg-muted text-muted-foreground border-border';
  const label = STATUS_LABELS[status] ?? status;
  return <span className={cn(baseClass, className)}>{label}</span>;
}

const appointmentStatusConfig: Record<string, { label: string; className: string }> = {
  scheduled: { label: 'Scheduled', className: 'bg-slate-50 text-slate-600 border-transparent' },
  confirmed: { label: 'Confirmed', className: 'bg-blue-50 text-blue-700 border-transparent' },
  in_progress: {
    label: 'In Progress',
    className: 'bg-emerald-50 text-emerald-700 border-transparent',
  },
  completed: {
    label: 'Completed',
    className: 'bg-emerald-50 text-emerald-700 border-transparent',
  },
  cancelled: {
    label: 'Cancelled',
    className: 'bg-rose-50 text-rose-700 border-transparent',
  },
  no_show: {
    label: 'No Show',
    className: 'bg-rose-50 text-rose-700 border-transparent',
  },
};

export function AppointmentStatusBadge({ status }: { status: string }) {
  const config =
    appointmentStatusConfig[status] ?? {
      label: status,
      className: 'bg-slate-50 text-slate-600 border-transparent',
    };
  return <span className={cn(baseClass, config.className)}>{config.label}</span>;
}
