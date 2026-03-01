import { useState, useCallback } from 'react';
import { addMonths, subMonths, addWeeks, subWeeks, addDays, subDays } from 'date-fns';
import { CalendarHeader, type CalendarViewType } from '@/components/staff/calendar/CalendarHeader';
import { MonthView } from '@/components/staff/calendar/MonthView';
import { WeekView } from '@/components/staff/calendar/WeekView';
import { DayView } from '@/components/staff/calendar/DayView';
import { TaskDialog } from '@/components/staff/calendar/TaskDialog';
import { useStaffTasks, type StaffTask } from '@/hooks/useStaffTasks';

export default function StaffCalendar() {
  const { tasks, leaveEntries, profiles, createTask, updateTask, deleteTask, requestDelete, getPendingDeleteRequest } = useStaffTasks();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [view, setView] = useState<CalendarViewType>('month');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<StaffTask | null>(null);
  const [initialDate, setInitialDate] = useState<Date | undefined>();

  const handleNavigate = useCallback((dir: 'prev' | 'next' | 'today') => {
    if (dir === 'today') { setCurrentDate(new Date()); return; }
    const fn = view === 'month' ? dir === 'next' ? addMonths : subMonths
      : view === 'week' ? dir === 'next' ? addWeeks : subWeeks
      : dir === 'next' ? addDays : subDays;
    setCurrentDate((d) => fn(d, 1));
  }, [view]);

  const openNewTask = (date?: Date) => { setSelectedTask(null); setInitialDate(date || new Date()); setDialogOpen(true); };
  const openEditTask = (task: StaffTask) => { setSelectedTask(task); setInitialDate(undefined); setDialogOpen(true); };
  const handleDayClick = (date: Date) => { if (view === 'month') { setCurrentDate(date); setView('day'); } };

  return (
    <div>
      <CalendarHeader currentDate={currentDate} view={view} onViewChange={setView} onNavigate={handleNavigate} onAddTask={() => openNewTask()} />
      {view === 'month' && <MonthView currentDate={currentDate} tasks={tasks} leaveEntries={leaveEntries} onTaskClick={openEditTask} onDayClick={handleDayClick} />}
      {view === 'week' && <WeekView currentDate={currentDate} tasks={tasks} leaveEntries={leaveEntries} onTaskClick={openEditTask} onSlotClick={openNewTask} />}
      {view === 'day' && <DayView currentDate={currentDate} tasks={tasks} leaveEntries={leaveEntries} onTaskClick={openEditTask} onSlotClick={openNewTask} />}
      <TaskDialog open={dialogOpen} onClose={() => setDialogOpen(false)} task={selectedTask} initialDate={initialDate} profiles={profiles} onSave={createTask} onUpdate={updateTask} onDelete={deleteTask} onRequestDelete={requestDelete} getPendingDeleteRequest={getPendingDeleteRequest} />
    </div>
  );
}
