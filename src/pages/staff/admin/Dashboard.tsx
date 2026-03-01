import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Users, Map, Clock, TrendingUp, Inbox } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { format, startOfDay, endOfDay } from 'date-fns';

export default function StaffAdminDashboard() {
  const [stats, setStats] = useState({ totalEmployees: 0, activeZones: 0, todayPunches: 0, punchedInNow: 0 });
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => { fetchStats(); fetchPendingCount(); }, []);

  const fetchStats = async () => {
    const { count: employeeCount } = await supabase.from('profiles').select('*', { count: 'exact', head: true });
    const { count: zoneCount } = await supabase.from('geofence_zones').select('*', { count: 'exact', head: true }).eq('is_active', true);
    const today = new Date();
    const { count: punchCount } = await supabase.from('attendance_records').select('*', { count: 'exact', head: true }).gte('punch_time', startOfDay(today).toISOString()).lte('punch_time', endOfDay(today).toISOString());
    const { data: lastPunches } = await supabase.from('attendance_records').select('user_id, punch_type').gte('punch_time', startOfDay(today).toISOString()).order('punch_time', { ascending: false });
    const userLastPunch: Record<string, string> = {};
    lastPunches?.forEach((p) => { if (!userLastPunch[p.user_id]) userLastPunch[p.user_id] = p.punch_type; });
    const punchedInCount = Object.values(userLastPunch).filter(t => t === 'in').length;
    setStats({ totalEmployees: employeeCount || 0, activeZones: zoneCount || 0, todayPunches: punchCount || 0, punchedInNow: punchedInCount });
  };

  const fetchPendingCount = async () => {
    const [{ count: dc }, { count: lc }] = await Promise.all([
      supabase.from('task_delete_requests').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
      supabase.from('leave_requests').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
    ]);
    setPendingCount((dc || 0) + (lc || 0));
  };

  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-bold tracking-tight">Admin Dashboard</h1><p className="text-muted-foreground">{format(new Date(), 'EEEE, MMMM d, yyyy')}</p></div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card><CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium">Total Employees</CardTitle><Users className="h-4 w-4 text-muted-foreground" /></CardHeader><CardContent><div className="text-2xl font-bold">{stats.totalEmployees}</div><p className="text-xs text-muted-foreground">Registered staff</p></CardContent></Card>
        <Card><CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium">Active Zones</CardTitle><Map className="h-4 w-4 text-muted-foreground" /></CardHeader><CardContent><div className="text-2xl font-bold">{stats.activeZones}</div><p className="text-xs text-muted-foreground">Geofence locations</p></CardContent></Card>
        <Card><CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium">Today's Punches</CardTitle><Clock className="h-4 w-4 text-muted-foreground" /></CardHeader><CardContent><div className="text-2xl font-bold">{stats.todayPunches}</div><p className="text-xs text-muted-foreground">Total punch records</p></CardContent></Card>
        <Card><CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium">Currently In</CardTitle><TrendingUp className="h-4 w-4 text-muted-foreground" /></CardHeader><CardContent><div className="text-2xl font-bold">{stats.punchedInNow}</div><p className="text-xs text-muted-foreground">Staff punched in now</p></CardContent></Card>
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card><CardHeader><CardTitle className="flex items-center gap-2"><Users className="h-5 w-5" />Manage Employees</CardTitle><CardDescription>Add, edit, or remove staff</CardDescription></CardHeader><CardContent><Button asChild className="w-full"><Link to="/staff/admin/employees">View Employees</Link></Button></CardContent></Card>
        <Card><CardHeader><CardTitle className="flex items-center gap-2"><Map className="h-5 w-5" />Manage Zones</CardTitle><CardDescription>Configure geofence locations</CardDescription></CardHeader><CardContent><Button asChild className="w-full"><Link to="/staff/admin/zones">View Zones</Link></Button></CardContent></Card>
        <Card><CardHeader><CardTitle className="flex items-center gap-2"><Inbox className="h-5 w-5" />Requests{pendingCount > 0 && <span className="inline-flex items-center justify-center rounded-full bg-destructive px-2 py-0.5 text-xs font-medium text-destructive-foreground">{pendingCount}</span>}</CardTitle><CardDescription>Task deletions & leave requests</CardDescription></CardHeader><CardContent><Button asChild className="w-full"><Link to="/staff/admin/requests">View Requests</Link></Button></CardContent></Card>
      </div>
    </div>
  );
}
