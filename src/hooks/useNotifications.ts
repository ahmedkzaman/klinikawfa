import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface StaffNotification {
  id: string;
  user_id: string;
  type: string;
  title: string;
  message: string;
  related_task_id: string | null;
  is_read: boolean;
  created_at: string;
}

export function useNotifications() {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<StaffNotification[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchNotifications = useCallback(async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from('staff_notifications')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50);
    if (!error && data) setNotifications(data as StaffNotification[]);
    setIsLoading(false);
  }, [user]);

  useEffect(() => {
    if (!user) return;
    fetchNotifications();
    const channel = supabase
      .channel('staff-notifications-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'staff_notifications', filter: `user_id=eq.${user.id}` }, () => { fetchNotifications(); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, fetchNotifications]);

  const markAsRead = async (id: string) => {
    await supabase.from('staff_notifications').update({ is_read: true }).eq('id', id);
  };

  const markAllAsRead = async () => {
    if (!user) return;
    await supabase.from('staff_notifications').update({ is_read: true }).eq('user_id', user.id).eq('is_read', false);
  };

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  return { notifications, unreadCount, isLoading, markAsRead, markAllAsRead };
}
