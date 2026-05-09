import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval,
  isSameMonth, isToday, format, parseISO, startOfDay,
} from 'date-fns';
import type { StaffTask, LeaveEntry } from '@/hooks/useStaffTasks';
import { TaskPill } from './TaskPill';
import { LeavePill } from './LeavePill';
import { cn } from '@/lib/utils';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MAX_VISIBLE = 3;

interface MonthViewProps {
  currentDate: Date;
  tasks: StaffTask[];
  leaveEntries: LeaveEntry[];
  onTaskClick: (task: StaffTask) => void;
  onDayClick: (date: Date) => void;
}

export function MonthView({ currentDate, tasks, leaveEntries, onTaskClick, onDayClick }: MonthViewProps) {
  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const calStart = startOfWeek(monthStart);
  const calEnd = endOfWeek(monthEnd);
  const days = eachDayOfInterval({ start: calStart, end: calEnd });

  const getTasksForDay = (day: Date) =>
    tasks.filter((t) => {
      const start = parseISO(t.start_date);
      const end = t.end_date ? parseISO(t.end_date) : start;
      return day >= new Date(start.toDateString()) && day <= new Date(end.toDateString());
    });

  const getLeaveForDay = (day: Date) =>
    leaveEntries.filter((l) => {
      const start = startOfDay(parseISO(l.start_date));
      const end = startOfDay(parseISO(l.end_date));
      const d = startOfDay(day);
      return d >= start && d <= end;
    });

  return (
    <div className="border rounded-lg overflow-hidden">
      <div className="grid grid-cols-7 border-b bg-slate-50">
        {WEEKDAYS.map((d) => (<div key={d} className="text-center text-xs font-medium text-slate-500 py-2">{d}</div>))}
      </div>
      <div className="grid grid-cols-7">
        {days.map((day, i) => {
          const dayTasks = getTasksForDay(day);
          const dayLeave = getLeaveForDay(day);
          const allItems = dayLeave.length + dayTasks.length;
          const inMonth = isSameMonth(day, currentDate);
          return (
            <div key={i} onClick={() => onDayClick(day)} className={cn('min-h-[100px] border-b border-r p-1 cursor-pointer hover:bg-slate-50 transition-colors', !inMonth && 'bg-slate-50/60 text-slate-500')}>
              <div className={cn('text-xs font-medium mb-1 w-6 h-6 flex items-center justify-center rounded-full', isToday(day) && 'bg-blue-600 text-white')}>{format(day, 'd')}</div>
              <div className="space-y-0.5">
                {dayLeave.map((l) => (<LeavePill key={`leave-${l.id}`} leave={l} compact />))}
                {dayTasks.slice(0, Math.max(0, MAX_VISIBLE - dayLeave.length)).map((t) => (<TaskPill key={t.id} task={t} onClick={onTaskClick} compact />))}
                {allItems > MAX_VISIBLE && (<div className="text-[10px] text-slate-500 pl-1">+{allItems - MAX_VISIBLE} more</div>)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
