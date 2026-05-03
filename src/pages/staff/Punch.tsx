import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { MapPin, Loader2, RefreshCw, CheckCircle, AlertTriangle, XCircle, CalendarClock } from 'lucide-react';
import { useGeolocation } from '@/hooks/useGeolocation';
import { useAuth } from '@/contexts/AuthContext';
import { checkGeofence, formatDistance, getAccuracyStatus } from '@/lib/geofence';
import { getUserShiftForDate, type ShiftInfo } from '@/lib/rosterUtils';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useUserPunchBuffers } from '@/hooks/useUserPunchBuffers';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { FaceVerificationModal } from '@/components/staff/FaceVerificationModal';

interface ZoneAssignment {
  zone_id: string;
  start_time: string;
  end_time: string;
  days_of_week: number[];
  is_active: boolean;
}

function checkAssignment(
  assignments: ZoneAssignment[],
  zoneId: string | undefined,
  nextPunchType: 'in' | 'out',
  buffers: { clock_in_early_min: number; clock_in_late_min: number; clock_out_early_min: number; clock_out_late_min: number },
): string | null {
  if (assignments.length === 0) return null;
  if (!zoneId) return 'You are not assigned to this zone.';
  const zoneAssignments = assignments.filter(a => a.zone_id === zoneId);
  if (zoneAssignments.length === 0) return 'You are not assigned to this zone.';
  const now = new Date();
  const currentDay = now.getDay();
  // Match by day-of-week + buffered window so punch-out after shift end still passes
  const toMin = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const matchingShift = zoneAssignments.find(a => {
    if (!a.days_of_week.includes(currentDay)) return false;
    const startMin = toMin(a.start_time);
    let endMin = toMin(a.end_time);
    if (endMin <= startMin) endMin += 24 * 60; // crosses midnight
    const winStart = nextPunchType === 'in'
      ? startMin - buffers.clock_in_early_min
      : endMin - buffers.clock_out_early_min;
    const winEnd = nextPunchType === 'in'
      ? startMin + buffers.clock_in_late_min
      : endMin + buffers.clock_out_late_min;
    const adjNow = nowMin < startMin - 12 * 60 ? nowMin + 24 * 60 : nowMin;
    return adjNow >= winStart && adjNow <= winEnd;
  });
  if (!matchingShift) {
    const anyDayMatch = zoneAssignments.find(a => a.days_of_week.includes(currentDay));
    if (anyDayMatch) return `Outside your shift hours (${anyDayMatch.start_time} – ${anyDayMatch.end_time}).`;
    return 'You are not scheduled to work today at this zone.';
  }
  return null;
}

export default function StaffPunch() {
  const { user } = useAuth();
  const { toast } = useToast();
  const geo = useGeolocation();
  const [zones, setZones] = useState<any[]>([]);
  const [lastPunch, setLastPunch] = useState<any>(null);
  const [isPunching, setIsPunching] = useState(false);
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [showFaceVerification, setShowFaceVerification] = useState(false);
  const [assignments, setAssignments] = useState<ZoneAssignment[]>([]);
  const [todayShift, setTodayShift] = useState<ShiftInfo | null>(null);
  const [shiftLoading, setShiftLoading] = useState(true);

  useEffect(() => { if (user) fetchData(); }, [user]);
  useEffect(() => { geo.getCurrentPosition(); }, []);
  useEffect(() => {
    if (user) {
      setShiftLoading(true);
      getUserShiftForDate(user.id, new Date()).then(shift => {
        setTodayShift(shift);
        setShiftLoading(false);
      });
    }
  }, [user]);

  const fetchData = async () => {
    setIsLoadingData(true);
    const todayStr = format(new Date(), 'yyyy-MM-dd');
    // Roster-derived assignments (preferred) take precedence over manual recurring
    const [zonesRes, punchRes, manualRes, rosterRes] = await Promise.all([
      supabase.from('geofence_zones').select('id, name, latitude, longitude, radius_meters').eq('is_active', true),
      supabase.from('attendance_records').select('punch_type, punch_time').eq('user_id', user?.id).order('punch_time', { ascending: false }).limit(1).single(),
      supabase.from('staff_zone_assignments').select('zone_id, start_time, end_time, days_of_week, is_active').eq('user_id', user?.id).eq('is_active', true),
      supabase.from('roster_zone_assignments').select('zone_id, start_time, end_time').eq('user_id', user?.id).eq('work_date', todayStr),
    ]);
    if (zonesRes.data) setZones(zonesRes.data);
    if (punchRes.data) setLastPunch(punchRes.data);

    // If today has roster-derived assignments, use them (mapped to recurring shape with today's day-of-week).
    // Otherwise fall back to manual recurring assignments.
    const todayDow = new Date().getDay();
    if (rosterRes.data && rosterRes.data.length > 0) {
      setAssignments(rosterRes.data.map((r: any) => ({
        zone_id: r.zone_id,
        start_time: r.start_time,
        end_time: r.end_time,
        days_of_week: [todayDow],
        is_active: true,
      })));
    } else {
      setAssignments(manualRes.data || []);
    }
    setIsLoadingData(false);
  };

  const geofenceResult = geo.latitude && geo.longitude && zones.length > 0
    ? checkGeofence({ latitude: geo.latitude, longitude: geo.longitude }, zones) : null;
  const accuracyStatus = geo.accuracy ? getAccuracyStatus(geo.accuracy) : null;
  const isPunchedIn = lastPunch?.punch_type === 'in';
  const nextPunchType = isPunchedIn ? 'out' : 'in';
  const assignmentBlock = geofenceResult?.isWithinZone ? checkAssignment(assignments, geofenceResult.zone?.id) : null;

  const { buffers } = useUserPunchBuffers(user?.id, todayShift?.shiftKey);

  // Format minutes-from-midnight as h:mm AM/PM (handles next-day wraps)
  const fmtTime = (date: Date) => format(date, 'h:mm a');

  // Asymmetric punch window: in vs out have different pre/post buffers
  const computeShiftWindowBlock = (): string | null => {
    if (!todayShift) return null; // No roster = allow (fallback)
    const now = new Date();
    const [startH, startM] = todayShift.start.split(':').map(Number);
    const [endH, endM] = todayShift.end.split(':').map(Number);
    const shiftStart = new Date(now); shiftStart.setHours(startH, startM, 0, 0);
    const shiftEnd = new Date(now); shiftEnd.setHours(endH, endM, 0, 0);
    // Handle shifts that cross midnight (e.g. 20:00 → 00:00)
    if (shiftEnd.getTime() <= shiftStart.getTime()) {
      shiftEnd.setDate(shiftEnd.getDate() + 1);
    }

    if (nextPunchType === 'in') {
      const openAt = new Date(shiftStart.getTime() - buffers.clock_in_early_min * 60_000);
      const closeAt = new Date(shiftStart.getTime() + buffers.clock_in_late_min * 60_000);
      if (now < openAt) return `Punch-in opens at ${fmtTime(openAt)} (${buffers.clock_in_early_min} min before your ${fmtTime(shiftStart)} shift)`;
      if (now > closeAt) return `Punch-in closed at ${fmtTime(closeAt)} (${buffers.clock_in_late_min} min after shift start)`;
      return null;
    }
    // Punch out
    const openAt = new Date(shiftEnd.getTime() - buffers.clock_out_early_min * 60_000);
    const closeAt = new Date(shiftEnd.getTime() + buffers.clock_out_late_min * 60_000);
    if (now < openAt) return `Punch-out opens at ${fmtTime(openAt)} (${buffers.clock_out_early_min} min before your ${fmtTime(shiftEnd)} shift end)`;
    if (now > closeAt) return `Punch-out closed at ${fmtTime(closeAt)} (${buffers.clock_out_late_min} min after shift end)`;
    return null;
  };

  const shiftWindowBlock = computeShiftWindowBlock();

  const handlePunchClick = () => {
    if (!geo.latitude || !geo.longitude || !geofenceResult?.isWithinZone) { toast({ title: 'Cannot Punch', description: 'You must be within a valid zone.', variant: 'destructive' }); return; }
    if (assignmentBlock) { toast({ title: 'Cannot Punch', description: assignmentBlock, variant: 'destructive' }); return; }
    if (shiftWindowBlock) { toast({ title: 'Cannot Punch', description: shiftWindowBlock, variant: 'destructive' }); return; }
    setShowFaceVerification(true);
  };

  const handleFaceVerified = async () => {
    setIsPunching(true);
    const { error } = await supabase.from('attendance_records').insert({
      user_id: user?.id, punch_type: nextPunchType, latitude: geo.latitude!, longitude: geo.longitude!,
      accuracy_meters: geo.accuracy, zone_id: geofenceResult?.zone?.id, face_verified: true,
    });
    if (error) toast({ title: 'Punch Failed', description: 'Error recording punch.', variant: 'destructive' });
    else { toast({ title: nextPunchType === 'in' ? 'Punched In!' : 'Punched Out!', description: `Recorded at ${geofenceResult?.zone?.name}` }); setLastPunch({ punch_type: nextPunchType, punch_time: new Date().toISOString() }); }
    setIsPunching(false);
  };

  const canPunch = geofenceResult?.isWithinZone && !assignmentBlock && !shiftWindowBlock && !geo.isLoading && !isPunching;

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div><h1 className="text-2xl font-bold tracking-tight">Punch In/Out</h1><p className="text-muted-foreground">Record your attendance using GPS verification</p></div>

      {/* Today's Shift Info */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base"><CalendarClock className="h-5 w-5" />Today's Shift</CardTitle>
        </CardHeader>
        <CardContent>
          {shiftLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground text-sm"><Loader2 className="h-4 w-4 animate-spin" />Loading roster...</div>
          ) : todayShift ? (
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="text-sm">{todayShift.shiftKey}</Badge>
              <span className="text-sm font-medium">{todayShift.label}</span>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No shift assigned today (roster not found)</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><MapPin className="h-5 w-5" />Location Status</CardTitle><CardDescription>Your current GPS position and zone verification</CardDescription></CardHeader>
        <CardContent className="space-y-4">
          {geo.isLoading && <div className="flex items-center gap-3 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /><span>Getting your location...</span></div>}
          {geo.error && <Alert variant="destructive"><AlertTriangle className="h-4 w-4" /><AlertDescription>{geo.error}</AlertDescription></Alert>}
          {geo.latitude && geo.longitude && !geo.isLoading && (
            <div className="space-y-3">
              {accuracyStatus && (
                <div className={cn('flex items-center gap-2 text-sm', accuracyStatus.status === 'good' && 'text-green-600', accuracyStatus.status === 'fair' && 'text-yellow-600', accuracyStatus.status === 'poor' && 'text-red-600')}>
                  {accuracyStatus.status === 'good' && <CheckCircle className="h-4 w-4" />}{accuracyStatus.status === 'fair' && <AlertTriangle className="h-4 w-4" />}{accuracyStatus.status === 'poor' && <XCircle className="h-4 w-4" />}
                  <span>{accuracyStatus.message} ({Math.round(geo.accuracy!)}m)</span>
                </div>
              )}
              {geofenceResult && (
                <div className={cn('p-4 rounded-lg border', geofenceResult.isWithinZone ? 'bg-green-50 border-green-200 dark:bg-green-950/20 dark:border-green-800' : 'bg-red-50 border-red-200 dark:bg-red-950/20 dark:border-red-800')}>
                  {geofenceResult.isWithinZone ? (
                    <div className="flex items-center gap-2 text-green-700 dark:text-green-400"><CheckCircle className="h-5 w-5" /><div><p className="font-medium">Inside Zone</p><p className="text-sm opacity-80">{geofenceResult.zone?.name}</p></div></div>
                  ) : (
                    <div className="flex items-center gap-2 text-red-700 dark:text-red-400"><XCircle className="h-5 w-5" /><div><p className="font-medium">Outside Zone</p><p className="text-sm opacity-80">Nearest: {geofenceResult.nearestZone?.name} ({formatDistance(geofenceResult.distance)} away)</p></div></div>
                  )}
                </div>
              )}
              {assignmentBlock && geofenceResult?.isWithinZone && <Alert variant="destructive"><AlertTriangle className="h-4 w-4" /><AlertDescription>{assignmentBlock}</AlertDescription></Alert>}
              {shiftWindowBlock && geofenceResult?.isWithinZone && !assignmentBlock && <Alert variant="destructive"><AlertTriangle className="h-4 w-4" /><AlertDescription>{shiftWindowBlock}</AlertDescription></Alert>}
              <Button variant="outline" size="sm" onClick={geo.getCurrentPosition} disabled={geo.isLoading}><RefreshCw className={cn('h-4 w-4 mr-2', geo.isLoading && 'animate-spin')} />Refresh Location</Button>
            </div>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Record Attendance</CardTitle>
          {lastPunch && <CardDescription>Last punch: {isPunchedIn ? 'In' : 'Out'} at {format(new Date(lastPunch.punch_time), 'h:mm a, MMM d')}</CardDescription>}
        </CardHeader>
        <CardContent>
          <Button size="lg" className={cn('w-full h-20 text-lg', nextPunchType === 'in' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700')} disabled={!canPunch || isLoadingData} onClick={handlePunchClick}>
            {isPunching ? <><Loader2 className="h-6 w-6 mr-2 animate-spin" />Recording...</> : <><MapPin className="h-6 w-6 mr-2" />Punch {nextPunchType === 'in' ? 'In' : 'Out'}</>}
          </Button>
          <FaceVerificationModal open={showFaceVerification} onOpenChange={setShowFaceVerification} onVerified={handleFaceVerified} punchType={nextPunchType} />
          {!canPunch && !geo.isLoading && !isLoadingData && <p className="text-sm text-muted-foreground text-center mt-4">{shiftWindowBlock || assignmentBlock || (!geo.latitude ? 'Enable location access to punch' : 'Move to an allowed zone to punch')}</p>}
        </CardContent>
      </Card>
    </div>
  );
}
