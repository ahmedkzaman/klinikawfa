import { startOfWeek, addDays, format, isToday, parseISO, isSameDay, startOfDay } from 'date-fns';
import type { StaffTask, LeaveEntry } from '@/hooks/useStaffTasks';
import { TaskPill } from './TaskPill';
import { LeavePill } from './LeavePill';
import { cn } from '@/lib/utils';

const HOURS = Array.from({ length: 24 }, (_, i) => i);

interface WeekViewProps {
  currentDate: Date;
  tasks: StaffTask[];
  leaveEntries: LeaveEntry[];
  onTaskClick: (task: StaffTask) => void;
  onSlotClick: (date: Date) => void;
}

export function WeekView({ currentDate, tasks, leaveEntries, onTaskClick, onSlotClick }: WeekViewProps) {
  const weekStart = startOfWeek(currentDate);
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const getTasksForDay = (day: Date) => tasks.filter((t) => isSameDay(parseISO(t.start_date), day));
  const getLeaveForDay = (day: Date) => leaveEntries.filter((l) => {
    const start = startOfDay(parseISO(l.start_date));
    const end = startOfDay(parseISO(l.end_date));
    return startOfDay(day) >= start && startOfDay(day) <= end;
  });

  return (
    <div className="border rounded-lg overflow-auto max-h-[calc(100vh-220px)]">
      <div className="grid grid-cols-[60px_repeat(7,1fr)] border-b bg-slate-50 sticky top-0 z-10">
        <div className="border-r" />
        {days.map((day, i) => (
          <div key={i} className={cn('text-center py-2 border-r', isToday(day) && 'bg-blue-50')}>
            <div className="text-xs text-slate-500">{format(day, 'EEE')}</div>
            <div className={cn('text-sm font-medium w-7 h-7 mx-auto flex items-center justify-center rounded-full', isToday(day) && 'bg-blue-600 text-white')}>{format(day, 'd')}</div>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-[60px_repeat(7,1fr)] border-b bg-rose-50">
        <div className="text-[10px] text-slate-500 text-right pr-2 pt-1 border-r">Leave</div>
        {days.map((day, di) => (<div key={di} className="border-r p-0.5 space-y-0.5">{getLeaveForDay(day).map((l) => (<LeavePill key={`leave-${l.id}`} leave={l} compact />))}</div>))}
      </div>
      {HOURS.map((hour) => (
        <div key={hour} className="grid grid-cols-[60px_repeat(7,1fr)] border-b min-h-[48px]">
          <div className="text-[10px] text-slate-500 text-right pr-2 pt-1 border-r">{format(new Date(2000, 0, 1, hour), 'ha')}</div>
          {days.map((day, di) => {
            const dayTasks = getTasksForDay(day).filter((t) => parseISO(t.start_date).getHours() === hour);
            return (
              <div key={di} className="border-r p-0.5 cursor-pointer hover:bg-slate-50 transition-colors" onClick={() => { const d = new Date(day); d.setHours(hour); onSlotClick(d); }}>
                {dayTasks.map((t) => (<TaskPill key={t.id} task={t} onClick={onTaskClick} />))}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
