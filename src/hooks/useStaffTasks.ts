import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface StaffTask {
  id: string;
  title: string;
  description: string | null;
  created_by: string;
  assigned_to: string | null;
  start_date: string;
  end_date: string | null;
  deadline: string | null;
  color: string;
  is_completed: boolean;
  board_column: string;
  visibility: string;
  last_edited_by: string | null;
  created_at: string;
  updated_at: string;
  creator_name?: string;
  assignee_name?: string;
}

export interface TaskFormData {
  title: string;
  description?: string;
  assigned_to?: string | null;
  start_date: Date;
  end_date?: Date | null;
  deadline?: Date | null;
  color: string;
  board_column?: string;
  visibility?: string;
}

export interface LeaveEntry {
  id: string;
  user_id: string;
  user_name: string;
  leave_type: string;
  start_date: string;
  end_date: string;
}

export function useStaffTasks() {
  const { user } = useAuth();
  const [tasks, setTasks] = useState<StaffTask[]>([]);
  const [profiles, setProfiles] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [leaveEntries, setLeaveEntries] = useState<LeaveEntry[]>([]);

  const fetchProfiles = useCallback(async () => {
    const { data } = await supabase.from('profiles').select('id, full_name');
    if (data) {
      const map: Record<string, string> = {};
      data.forEach((p: any) => { map[p.id] = p.full_name || 'Unknown'; });
      setProfiles(map);
    }
  }, []);

  const fetchTasks = useCallback(async () => {
    const { data, error } = await supabase
      .from('staff_tasks')
      .select('*')
      .order('start_date', { ascending: true });
    if (error) { console.error('Error fetching tasks:', error); return; }
    setTasks(data || []);
    setIsLoading(false);
  }, []);

  const fetchLeaveEntries = useCallback(async () => {
    const { data } = await supabase
      .from('leave_requests')
      .select('id, user_id, leave_type, start_date, end_date')
      .eq('status', 'approved');
    if (data) {
      setLeaveEntries(data.map((l: any) => ({ ...l, user_name: '' })));
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    fetchTasks();
    fetchProfiles();
    fetchLeaveEntries();

    const channel = supabase
      .channel('staff-tasks-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'staff_tasks' }, () => { fetchTasks(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'leave_requests' }, () => { fetchLeaveEntries(); })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user, fetchTasks, fetchProfiles, fetchLeaveEntries]);

  const createTask = async (data: TaskFormData) => {
    if (!user) return { error: new Error('Not authenticated') };
    const { error } = await supabase.from('staff_tasks').insert({
      title: data.title,
      description: data.description || null,
      created_by: user.id,
      assigned_to: data.assigned_to || user.id,
      start_date: data.start_date.toISOString(),
      end_date: data.end_date?.toISOString() || null,
      deadline: data.deadline?.toISOString() || null,
      color: data.color,
    });
    return { error };
  };

  const updateTask = async (id: string, data: Partial<TaskFormData> & { is_completed?: boolean; board_column?: string; visibility?: string; last_edited_by?: string }) => {
    const updates: Record<string, unknown> = {};
    if (data.title !== undefined) updates.title = data.title;
    if (data.description !== undefined) updates.description = data.description || null;
    if (data.assigned_to !== undefined) updates.assigned_to = data.assigned_to || null;
    if (data.start_date !== undefined) updates.start_date = data.start_date.toISOString();
    if (data.end_date !== undefined) updates.end_date = data.end_date?.toISOString() || null;
    if (data.deadline !== undefined) updates.deadline = data.deadline?.toISOString() || null;
    if (data.color !== undefined) updates.color = data.color;
    if (data.is_completed !== undefined) updates.is_completed = data.is_completed;
    const { error } = await supabase.from('staff_tasks').update(updates).eq('id', id);
    return { error };
  };

  const deleteTask = async (id: string) => {
    const { error } = await supabase.from('staff_tasks').delete().eq('id', id);
    return { error };
  };

  const requestDelete = async (taskId: string) => {
    if (!user) return { error: new Error('Not authenticated') };
    const { error } = await supabase.from('task_delete_requests').insert({ task_id: taskId, requested_by: user.id });
    return { error };
  };

  const getPendingDeleteRequest = async (taskId: string) => {
    if (!user) return null;
    const { data } = await supabase
      .from('task_delete_requests')
      .select('id, status')
      .eq('task_id', taskId)
      .eq('requested_by', user.id)
      .eq('status', 'pending')
      .maybeSingle();
    return data;
  };

  const enrichedTasks = tasks.map((t) => ({
    ...t,
    creator_name: profiles[t.created_by] || 'Unknown',
    assignee_name: t.assigned_to ? profiles[t.assigned_to] || 'Unknown' : undefined,
  }));

  const enrichedLeave = leaveEntries.map((l) => ({
    ...l,
    user_name: profiles[l.user_id] || 'Unknown',
  }));

  return { tasks: enrichedTasks, leaveEntries: enrichedLeave, profiles, isLoading, createTask, updateTask, deleteTask, requestDelete, getPendingDeleteRequest };
}
