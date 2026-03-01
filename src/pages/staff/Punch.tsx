import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { MapPin, Loader2, RefreshCw, CheckCircle, AlertTriangle, XCircle } from 'lucide-react';
import { useGeolocation } from '@/hooks/useGeolocation';
import { useAuth } from '@/contexts/AuthContext';
import { checkGeofence, formatDistance, getAccuracyStatus } from '@/lib/geofence';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
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

function checkAssignment(assignments: ZoneAssignment[], zoneId: string | undefined): string | null {
  if (assignments.length === 0) return null;
  if (!zoneId) return 'You are not assigned to this zone.';
  const zoneAssignments = assignments.filter(a => a.zone_id === zoneId);
  if (zoneAssignments.length === 0) return 'You are not assigned to this zone.';
  const now = new Date();
  const currentDay = now.getDay();
  const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const matchingShift = zoneAssignments.find(a => {
    if (!a.days_of_week.includes(currentDay)) return false;
    return currentTime >= a.start_time && currentTime <= a.end_time;
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

  useEffect(() => { if (user) fetchData(); }, [user]);
  useEffect(() => { geo.getCurrentPosition(); }, []);

  const fetchData = async () => {
    setIsLoadingData(true);
    const [zonesRes, punchRes, assignRes] = await Promise.all([
      supabase.from('geofence_zones').select('id, name, latitude, longitude, radius_meters').eq('is_active', true),
      supabase.from('attendance_records').select('punch_type, punch_time').eq('user_id', user?.id).order('punch_time', { ascending: false }).limit(1).single(),
      supabase.from('staff_zone_assignments').select('zone_id, start_time, end_time, days_of_week, is_active').eq('user_id', user?.id).eq('is_active', true),
    ]);
    if (zonesRes.data) setZones(zonesRes.data);
    if (punchRes.data) setLastPunch(punchRes.data);
    setAssignments(assignRes.data || []);
    setIsLoadingData(false);
  };

  const geofenceResult = geo.latitude && geo.longitude && zones.length > 0
    ? checkGeofence({ latitude: geo.latitude, longitude: geo.longitude }, zones) : null;
  const accuracyStatus = geo.accuracy ? getAccuracyStatus(geo.accuracy) : null;
  const isPunchedIn = lastPunch?.punch_type === 'in';
  const nextPunchType = isPunchedIn ? 'out' : 'in';
  const assignmentBlock = geofenceResult?.isWithinZone ? checkAssignment(assignments, geofenceResult.zone?.id) : null;

  const handlePunchClick = () => {
    if (!geo.latitude || !geo.longitude || !geofenceResult?.isWithinZone) { toast({ title: 'Cannot Punch', description: 'You must be within a valid zone.', variant: 'destructive' }); return; }
    if (assignmentBlock) { toast({ title: 'Cannot Punch', description: assignmentBlock, variant: 'destructive' }); return; }
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

  const canPunch = geofenceResult?.isWithinZone && !assignmentBlock && !geo.isLoading && !isPunching;

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div><h1 className="text-2xl font-bold tracking-tight">Punch In/Out</h1><p className="text-muted-foreground">Record your attendance using GPS verification</p></div>
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
          {!canPunch && !geo.isLoading && !isLoadingData && <p className="text-sm text-muted-foreground text-center mt-4">{assignmentBlock ? assignmentBlock : !geo.latitude ? 'Enable location access to punch' : 'Move to an allowed zone to punch'}</p>}
        </CardContent>
      </Card>
    </div>
  );
}
