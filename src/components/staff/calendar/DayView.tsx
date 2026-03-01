import { format, parseISO, isSameDay, startOfDay } from 'date-fns';
import type { StaffTask, LeaveEntry } from '@/hooks/useStaffTasks';
import { TaskPill } from './TaskPill';
import { LeavePill } from './LeavePill';

const HOURS = Array.from({ length: 24 }, (_, i) => i);

interface DayViewProps {
  currentDate: Date;
  tasks: StaffTask[];
  leaveEntries: LeaveEntry[];
  onTaskClick: (task: StaffTask) => void;
  onSlotClick: (date: Date) => void;
}

export function DayView({ currentDate, tasks, leaveEntries, onTaskClick, onSlotClick }: DayViewProps) {
  const dayTasks = tasks.filter((t) => isSameDay(parseISO(t.start_date), currentDate));
  const dayLeave = leaveEntries.filter((l) => {
    const start = startOfDay(parseISO(l.start_date));
    const end = startOfDay(parseISO(l.end_date));
    return startOfDay(currentDate) >= start && startOfDay(currentDate) <= end;
  });

  return (
    <div className="border rounded-lg overflow-auto max-h-[calc(100vh-220px)]">
      {dayLeave.length > 0 && (
        <div className="grid grid-cols-[60px_1fr] border-b bg-destructive/5">
          <div className="text-[10px] text-muted-foreground text-right pr-2 pt-1 border-r">Leave</div>
          <div className="p-1 space-y-0.5">{dayLeave.map((l) => (<LeavePill key={`leave-${l.id}`} leave={l} />))}</div>
        </div>
      )}
      {HOURS.map((hour) => {
        const hourTasks = dayTasks.filter((t) => parseISO(t.start_date).getHours() === hour);
        return (
          <div key={hour} className="grid grid-cols-[60px_1fr] border-b min-h-[56px]">
            <div className="text-[10px] text-muted-foreground text-right pr-2 pt-1 border-r">{format(new Date(2000, 0, 1, hour), 'h a')}</div>
            <div className="p-1 cursor-pointer hover:bg-muted/30 transition-colors space-y-0.5" onClick={() => { const d = new Date(currentDate); d.setHours(hour, 0, 0, 0); onSlotClick(d); }}>
              {hourTasks.map((t) => (<TaskPill key={t.id} task={t} onClick={onTaskClick} />))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
