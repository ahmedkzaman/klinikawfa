import { Clock, UserCheck } from 'lucide-react';
import type { StaffTask } from '@/hooks/useStaffTasks';
import { cn } from '@/lib/utils';

interface TaskPillProps {
  task: StaffTask;
  onClick: (task: StaffTask) => void;
  compact?: boolean;
}

export function TaskPill({ task, onClick, compact = false }: TaskPillProps) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick(task); }}
      className={cn(
        'w-full text-left rounded px-1.5 py-0.5 text-xs truncate transition-opacity hover:opacity-80 flex items-center gap-1',
        task.is_completed && 'line-through opacity-60'
      )}
      style={{ backgroundColor: task.color + '22', color: task.color, borderLeft: `3px solid ${task.color}` }}
      title={`${task.title} — by ${task.creator_name}`}
    >
      {task.assigned_to && <UserCheck className="h-3 w-3 flex-shrink-0" />}
      {task.deadline && <Clock className="h-3 w-3 flex-shrink-0" />}
      <span className="truncate">{task.title}</span>
      {!compact && (
        <span className="ml-auto text-[10px] opacity-70 flex-shrink-0 hidden sm:inline">{task.creator_name?.split(' ')[0]}</span>
      )}
    </button>
  );
}
