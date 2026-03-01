import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { MapPin, History, Clock, CheckCircle, XCircle, Bell, CalendarDays } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useNotifications } from '@/hooks/useNotifications';
import { format } from 'date-fns';

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
      case 'task_assigned': return <CalendarDays className="h-4 w-4 text-blue-500" />;
      case 'delete_approved': return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'delete_rejected': return <XCircle className="h-4 w-4 text-red-500" />;
      default: return <Bell className="h-4 w-4 text-muted-foreground" />;
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Welcome back</h1>
        <p className="text-muted-foreground">{format(new Date(), 'EEEE, MMMM d, yyyy')}</p>
      </div>

      {unreadNotifications.length > 0 && (
        <Card className="border-blue-200 bg-blue-50/50 dark:border-blue-800 dark:bg-blue-950/20">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Bell className="h-4 w-4" /> Notifications
              <span className="inline-flex items-center justify-center rounded-full bg-primary px-2 py-0.5 text-xs font-medium text-primary-foreground">{unreadCount}</span>
            </CardTitle>
            <Button variant="ghost" size="sm" onClick={markAllAsRead}>Mark all read</Button>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {unreadNotifications.slice(0, 5).map((notif) => (
                <div key={notif.id} className="flex items-start gap-3 p-2 rounded-md bg-background/80 cursor-pointer hover:bg-background transition-colors" onClick={() => markAsRead(notif.id)}>
                  {getNotificationIcon(notif.type)}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{notif.title}</p>
                    <p className="text-xs text-muted-foreground truncate">{notif.message}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{format(new Date(notif.created_at), 'MMM d, h:mm a')}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Current Status</CardTitle>
            {isPunchedIn ? <CheckCircle className="h-4 w-4 text-green-500" /> : <XCircle className="h-4 w-4 text-muted-foreground" />}
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{isLoading ? '...' : isPunchedIn ? 'Clocked In' : 'Clocked Out'}</div>
            {lastPunch && <p className="text-xs text-muted-foreground mt-1">Last punch: {format(new Date(lastPunch.punch_time), 'h:mm a')}{lastPunch.zone_id && zones[lastPunch.zone_id] && <> at {zones[lastPunch.zone_id].name}</>}</p>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium">Today's Punches</CardTitle><Clock className="h-4 w-4 text-muted-foreground" /></CardHeader>
          <CardContent><div className="text-2xl font-bold">{isLoading ? '...' : todayRecords.length}</div><p className="text-xs text-muted-foreground mt-1">{todayRecords.length === 0 ? 'No punches today' : 'punch records today'}</p></CardContent>
        </Card>
        <Card className="md:col-span-2 lg:col-span-1">
          <CardHeader><CardTitle className="text-sm font-medium">Quick Actions</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            <Button asChild className="w-full"><Link to="/staff/punch"><MapPin className="h-4 w-4 mr-2" />{isPunchedIn ? 'Punch Out' : 'Punch In'}</Link></Button>
            <Button asChild variant="outline" className="w-full"><Link to="/staff/history"><History className="h-4 w-4 mr-2" />View History</Link></Button>
          </CardContent>
        </Card>
      </div>

      {todayRecords.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Today's Timeline</CardTitle><CardDescription>Your attendance activity for today</CardDescription></CardHeader>
          <CardContent>
            <div className="space-y-4">
              {todayRecords.map((record) => (
                <div key={record.id} className="flex items-start gap-4">
                  <div className={`h-2 w-2 rounded-full mt-2 ${record.punch_type === 'in' ? 'bg-green-500' : 'bg-red-500'}`} />
                  <div className="flex-1">
                    <p className="text-sm font-medium">{record.punch_type === 'in' ? 'Punched In' : 'Punched Out'}</p>
                    <p className="text-xs text-muted-foreground">{format(new Date(record.punch_time), 'h:mm a')}{record.zone_id && zones[record.zone_id] && <> • {zones[record.zone_id].name}</>}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
