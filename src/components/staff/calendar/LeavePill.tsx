import { CalendarOff } from 'lucide-react';
import type { LeaveEntry } from '@/hooks/useStaffTasks';

interface LeavePillProps {
  leave: LeaveEntry;
  compact?: boolean;
}

export function LeavePill({ leave, compact = false }: LeavePillProps) {
  return (
    <div
      className="w-full text-left rounded px-1.5 py-0.5 text-xs truncate flex items-center gap-1 bg-destructive/15 text-destructive border-l-[3px] border-destructive"
      title={`${leave.user_name} — ${leave.leave_type} Leave`}
    >
      <CalendarOff className="h-3 w-3 flex-shrink-0" />
      <span className="truncate">{compact ? leave.user_name.split(' ')[0] : leave.user_name} - {leave.leave_type}</span>
    </div>
  );
}
