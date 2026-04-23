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
  scheduled: { label: 'Scheduled', className: 'bg-muted text-muted-foreground border-border' },
  confirmed: { label: 'Confirmed', className: 'bg-primary/10 text-primary border-primary/20' },
  in_progress: {
    label: 'In Progress',
    className: 'bg-accent text-accent-foreground border-border',
  },
  completed: {
    label: 'Completed',
    className: 'bg-primary/10 text-primary border-primary/20',
  },
  cancelled: {
    label: 'Cancelled',
    className: 'bg-destructive/10 text-destructive border-destructive/20',
  },
  no_show: {
    label: 'No Show',
    className: 'bg-destructive/10 text-destructive border-destructive/20',
  },
};

export function AppointmentStatusBadge({ status }: { status: string }) {
  const config =
    appointmentStatusConfig[status] ?? {
      label: status,
      className: 'bg-muted text-muted-foreground border-border',
    };
  return <span className={cn(baseClass, config.className)}>{config.label}</span>;
}
