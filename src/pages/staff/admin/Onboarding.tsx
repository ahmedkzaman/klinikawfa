import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { CheckCircle2, Circle, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';

interface OnboardingRecord {
  user_id: string;
  onboarding_data: Record<string, any>;
  job_description_acknowledged: boolean;
  job_scope_acknowledged: boolean;
  company_policy_acknowledged: boolean;
  is_completed: boolean;
  updated_at: string;
}

interface ProfileInfo {
  id: string;
  full_name: string | null;
  email: string;
}

export default function AdminOnboarding() {
  const [loading, setLoading] = useState(true);
  const [profiles, setProfiles] = useState<ProfileInfo[]>([]);
  const [onboardingMap, setOnboardingMap] = useState<Record<string, OnboardingRecord>>({});

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    const [{ data: profilesData }, { data: onboardingData }] = await Promise.all([
      supabase.from('profiles').select('id, full_name, email'),
      supabase.from('staff_onboarding' as any).select('*'),
    ]);

    if (profilesData) setProfiles(profilesData);

    const map: Record<string, OnboardingRecord> = {};
    if (onboardingData) {
      (onboardingData as unknown as OnboardingRecord[]).forEach((r) => {
        map[r.user_id] = r;
      });
    }
    setOnboardingMap(map);
    setLoading(false);
  };

  const completedCount = Object.values(onboardingMap).filter(r => r.is_completed).length;
  const totalStaff = profiles.length;

  const StepIcon = ({ done }: { done: boolean }) =>
    done ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : <Circle className="h-4 w-4 text-muted-foreground" />;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Staff Onboarding Status</h1>
        <p className="text-muted-foreground">Track which staff have completed onboarding.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Total Staff</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">{totalStaff}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Completed</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold text-green-600">{completedCount}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Pending</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold text-amber-600">{totalStaff - completedCount}</div></CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Staff</TableHead>
                <TableHead className="text-center">Form</TableHead>
                <TableHead className="text-center">Job Desc</TableHead>
                <TableHead className="text-center">Job Scope</TableHead>
                <TableHead className="text-center">Policy</TableHead>
                <TableHead className="text-center">Status</TableHead>
                <TableHead className="hidden sm:table-cell">Last Updated</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {profiles.map((profile) => {
                const record = onboardingMap[profile.id];
                const hasForm = record?.onboarding_data && Object.keys(record.onboarding_data).length > 0;

                return (
                  <TableRow key={profile.id}>
                    <TableCell>
                      <div>
                        <div className="font-medium text-sm">{profile.full_name || '—'}</div>
                        <div className="text-xs text-muted-foreground">{profile.email}</div>
                      </div>
                    </TableCell>
                    <TableCell className="text-center"><StepIcon done={!!hasForm} /></TableCell>
                    <TableCell className="text-center"><StepIcon done={!!record?.job_description_acknowledged} /></TableCell>
                    <TableCell className="text-center"><StepIcon done={!!record?.job_scope_acknowledged} /></TableCell>
                    <TableCell className="text-center"><StepIcon done={!!record?.company_policy_acknowledged} /></TableCell>
                    <TableCell className="text-center">
                      {record?.is_completed ? (
                        <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">Done</Badge>
                      ) : record ? (
                        <Badge variant="outline" className="text-amber-600 border-amber-300">In Progress</Badge>
                      ) : (
                        <Badge variant="outline" className="text-muted-foreground">Not Started</Badge>
                      )}
                    </TableCell>
                    <TableCell className="hidden sm:table-cell text-xs text-muted-foreground">
                      {record?.updated_at ? format(new Date(record.updated_at), 'dd MMM yyyy') : '—'}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
