import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { MapPin, History, Clock, CheckCircle, XCircle, Bell, CalendarDays } from 'lucide-react';
import KanbanBoard from '@/components/staff/KanbanBoard';
import DailyReportingCard from '@/components/staff/DailyReportingCard';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useNotifications } from '@/hooks/useNotifications';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import {
  bento, bentoHeader, fieldLabel, pageInner, pageShell, primaryBtn, secondaryBtn, softTile,
} from '@/lib/clinic/bentoTokens';

export default function StaffDashboard() {
  const { user } = useAuth();
  const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotifications();
  const [todayRecords, setTodayRecords] = useState<any[]>([]);
  const [zones, setZones] = useState<Record<string, { id: string; name: string }>>({});
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (user) { fetchTodayAttendance(); fetchZones(); }
  }, [user]);

  const fetchTodayAttendance = async () => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const { data } = await supabase.from('attendance_records').select('id, punch_type, punch_time, zone_id')
      .eq('user_id', user?.id).gte('punch_time', today.toISOString()).order('punch_time', { ascending: false });
    if (data) setTodayRecords(data);
    setIsLoading(false);
  };

  const fetchZones = async () => {
    const { data } = await supabase.from('geofence_zones').select('id, name');
    if (data) { const m: Record<string, any> = {}; data.forEach((z) => { m[z.id] = z; }); setZones(m); }
  };

  const lastPunch = todayRecords[0];
  const isPunchedIn = lastPunch?.punch_type === 'in';
  const unreadNotifications = notifications.filter((n) => !n.is_read);

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'task_assigned': return <CalendarDays className="h-4 w-4 text-blue-600" />;
      case 'delete_approved': return <CheckCircle className="h-4 w-4 text-emerald-600" />;
      case 'delete_rejected': return <XCircle className="h-4 w-4 text-rose-600" />;
      default: return <Bell className="h-4 w-4 text-slate-500" />;
    }
  };

  return (
    <div className={pageShell}>
      <div className={pageInner}>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-800">Welcome back</h1>
          <p className="text-sm text-slate-500">{format(new Date(), 'EEEE, MMMM d, yyyy')}</p>
        </div>

        {unreadNotifications.length > 0 && (
          <div className={cn(bento, 'p-4 border border-blue-100 bg-blue-50/40')}>
            <div className="flex items-center justify-between mb-3">
              <h2 className={cn(bentoHeader, 'mb-0 flex items-center gap-2')}>
                <Bell className="h-4 w-4" /> Notifications
                <span className="inline-flex items-center justify-center rounded-full bg-blue-600 px-2 py-0.5 text-xs font-medium text-white">{unreadCount}</span>
              </h2>
              <Button variant="ghost" size="sm" className="text-blue-700 hover:bg-blue-100" onClick={markAllAsRead}>Mark all read</Button>
            </div>
            <div className="space-y-2">
              {unreadNotifications.slice(0, 5).map((notif) => (
                <div key={notif.id} className={cn(softTile, 'flex items-start gap-3 cursor-pointer hover:bg-slate-100 transition-colors')} onClick={() => markAsRead(notif.id)}>
                  {getNotificationIcon(notif.type)}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-800">{notif.title}</p>
                    <p className="text-xs text-slate-600 truncate">{notif.message}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{format(new Date(notif.created_at), 'MMM d, h:mm a')}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <DailyReportingCard />

        <KanbanBoard />

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <div className={cn(bento, 'p-4')}>
            <div className="flex items-center justify-between mb-2">
              <span className={fieldLabel}>Current Status</span>
              {isPunchedIn ? <CheckCircle className="h-4 w-4 text-emerald-500" /> : <XCircle className="h-4 w-4 text-slate-400" />}
            </div>
            <div className="text-2xl font-bold text-slate-800">{isLoading ? '...' : isPunchedIn ? 'Clocked In' : 'Clocked Out'}</div>
            {lastPunch && <p className="text-xs text-slate-500 mt-1">Last punch: {format(new Date(lastPunch.punch_time), 'h:mm a')}{lastPunch.zone_id && zones[lastPunch.zone_id] && <> at {zones[lastPunch.zone_id].name}</>}</p>}
          </div>

          <div className={cn(bento, 'p-4')}>
            <div className="flex items-center justify-between mb-2">
              <span className={fieldLabel}>Today's Punches</span>
              <Clock className="h-4 w-4 text-slate-400" />
            </div>
            <div className="text-2xl font-bold text-slate-800">{isLoading ? '...' : todayRecords.length}</div>
            <p className="text-xs text-slate-500 mt-1">{todayRecords.length === 0 ? 'No punches today' : 'punch records today'}</p>
          </div>

          <div className={cn(bento, 'p-4 md:col-span-2 lg:col-span-1')}>
            <h2 className={bentoHeader}>Quick Actions</h2>
            <div className="space-y-2">
              <Button asChild className={cn(primaryBtn, 'w-full')}>
                <Link to="/staff/punch"><MapPin className="h-4 w-4 mr-2" />{isPunchedIn ? 'Punch Out' : 'Punch In'}</Link>
              </Button>
              <Button asChild className={cn(secondaryBtn, 'w-full')}>
                <Link to="/staff/history"><History className="h-4 w-4 mr-2" />View History</Link>
              </Button>
            </div>
          </div>
        </div>

        {todayRecords.length > 0 && (
          <div className={cn(bento, 'p-4')}>
            <h2 className={bentoHeader}>Today's Timeline</h2>
            <p className="text-sm text-slate-500 mb-4 -mt-2">Your attendance activity for today</p>
            <div className="space-y-4">
              {todayRecords.map((record) => (
                <div key={record.id} className="flex items-start gap-4">
                  <div className={cn('h-2 w-2 rounded-full mt-2', record.punch_type === 'in' ? 'bg-emerald-500' : 'bg-rose-500')} />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-slate-700">{record.punch_type === 'in' ? 'Punched In' : 'Punched Out'}</p>
                    <p className="text-xs text-slate-500">{format(new Date(record.punch_time), 'h:mm a')}{record.zone_id && zones[record.zone_id] && <> • {zones[record.zone_id].name}</>}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
