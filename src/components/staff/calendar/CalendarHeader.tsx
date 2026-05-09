import { format } from 'date-fns';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';

export type CalendarViewType = 'month' | 'week' | 'day';

interface CalendarHeaderProps {
  currentDate: Date;
  view: CalendarViewType;
  onViewChange: (view: CalendarViewType) => void;
  onNavigate: (direction: 'prev' | 'next' | 'today') => void;
  onAddTask: () => void;
}

export function CalendarHeader({ currentDate, view, onViewChange, onNavigate, onAddTask }: CalendarHeaderProps) {
  const label = view === 'month'
    ? format(currentDate, 'MMMM yyyy')
    : view === 'week'
      ? `Week of ${format(currentDate, 'MMM d, yyyy')}`
      : format(currentDate, 'EEEE, MMM d, yyyy');

  return (
    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4">
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => onNavigate('today')}>Today</Button>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onNavigate('prev')}><ChevronLeft className="h-4 w-4" /></Button>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onNavigate('next')}><ChevronRight className="h-4 w-4" /></Button>
        <h2 className="text-lg font-semibold ml-2">{label}</h2>
      </div>
      <div className="flex items-center gap-2">
        <div className="flex rounded-md border border-slate-200 overflow-hidden">
          {(['month', 'week', 'day'] as CalendarViewType[]).map((v) => (
            <button
              key={v}
              onClick={() => onViewChange(v)}
              className={`px-3 py-1.5 text-xs font-medium capitalize transition-colors ${
                view === v ? 'bg-blue-600 text-white' : 'bg-background text-slate-500 hover:bg-muted'
              }`}
            >
              {v}
            </button>
          ))}
        </div>
        <Button size="sm" onClick={onAddTask}><Plus className="h-4 w-4 mr-1" /> Task</Button>
      </div>
    </div>
  );
}
