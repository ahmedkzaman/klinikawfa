import { useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { addMonths, subMonths, addWeeks, subWeeks, addDays, subDays } from 'date-fns';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CalendarHeader, type CalendarViewType } from '@/components/staff/calendar/CalendarHeader';
import { MonthView } from '@/components/staff/calendar/MonthView';
import { WeekView } from '@/components/staff/calendar/WeekView';
import { DayView } from '@/components/staff/calendar/DayView';
import { TaskDialog } from '@/components/staff/calendar/TaskDialog';
import AppointmentsPanel from '@/components/staff/calendar/AppointmentsPanel';
import { useStaffTasks, type StaffTask } from '@/hooks/useStaffTasks';

export default function StaffCalendar() {
  const { tasks, leaveEntries, profiles, createTask, updateTask, deleteTask, requestDelete, getPendingDeleteRequest } = useStaffTasks();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [view, setView] = useState<CalendarViewType>('month');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<StaffTask | null>(null);
  const [initialDate, setInitialDate] = useState<Date | undefined>();

  const [params, setParams] = useSearchParams();
  const activeTab = params.get('tab') === 'appointments' ? 'appointments' : 'calendar';
  const onTabChange = (v: string) => {
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      if (v === 'calendar') next.delete('tab');
      else next.set('tab', v);
      return next;
    }, { replace: true });
  };

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
      <Tabs value={activeTab} onValueChange={onTabChange}>
        <div className="px-4 pt-4">
          <TabsList>
            <TabsTrigger value="calendar">Task Calendar</TabsTrigger>
            <TabsTrigger value="appointments">Appointments</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="calendar" className="mt-0">
          <CalendarHeader currentDate={currentDate} view={view} onViewChange={setView} onNavigate={handleNavigate} onAddTask={() => openNewTask()} />
          {view === 'month' && <MonthView currentDate={currentDate} tasks={tasks} leaveEntries={leaveEntries} onTaskClick={openEditTask} onDayClick={handleDayClick} />}
          {view === 'week' && <WeekView currentDate={currentDate} tasks={tasks} leaveEntries={leaveEntries} onTaskClick={openEditTask} onSlotClick={openNewTask} />}
          {view === 'day' && <DayView currentDate={currentDate} tasks={tasks} leaveEntries={leaveEntries} onTaskClick={openEditTask} onSlotClick={openNewTask} />}
          <TaskDialog open={dialogOpen} onClose={() => setDialogOpen(false)} task={selectedTask} initialDate={initialDate} profiles={profiles} onSave={createTask} onUpdate={updateTask} onDelete={deleteTask} onRequestDelete={requestDelete} getPendingDeleteRequest={getPendingDeleteRequest} />
        </TabsContent>

        <TabsContent value="appointments" className="mt-0">
          <AppointmentsPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}
