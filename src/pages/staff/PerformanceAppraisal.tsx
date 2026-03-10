import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Plus, ClipboardCheck, Calendar, User } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';

const statusColors: Record<string, string> = {
  draft: 'bg-muted text-muted-foreground',
  submitted: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  reviewed: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  completed: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
};

export default function PerformanceAppraisal() {
  const { user, isAdmin } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedDoctor, setSelectedDoctor] = useState('');
  const [periodFrom, setPeriodFrom] = useState('');
  const [periodTo, setPeriodTo] = useState('');

  // Fetch appraisals
  const { data: appraisals, isLoading } = useQuery({
    queryKey: ['performance-appraisals'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('performance_appraisals')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  // Fetch doctors (profiles) for admin create
  const { data: profiles } = useQuery({
    queryKey: ['profiles-for-appraisal'],
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles').select('id, full_name, email, position');
      if (error) throw error;
      return data;
    },
    enabled: isAdmin,
  });

  // Fetch responses to know which appraisals user is evaluator on
  const { data: myResponses } = useQuery({
    queryKey: ['my-appraisal-responses', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('appraisal_responses')
        .select('appraisal_id, evaluator_role, status')
        .eq('evaluator_id', user!.id);
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase
        .from('performance_appraisals')
        .insert({
          doctor_id: selectedDoctor,
          appraisal_period_from: periodFrom,
          appraisal_period_to: periodTo,
          created_by: user!.id,
        })
        .select()
        .single();
      if (error) throw error;

      // Auto-create self-evaluation response for the doctor
      const { error: respError } = await supabase
        .from('appraisal_responses')
        .insert({
          appraisal_id: data.id,
          evaluator_id: selectedDoctor,
          evaluator_role: 'Self',
        });
      if (respError) throw respError;

      return data;
    },
    onSuccess: (data) => {
      toast.success('Appraisal created successfully');
      queryClient.invalidateQueries({ queryKey: ['performance-appraisals'] });
      setCreateOpen(false);
      setSelectedDoctor('');
      setPeriodFrom('');
      setPeriodTo('');
      navigate(`/staff/appraisal/${data.id}`);
    },
    onError: (err: any) => toast.error(err.message),
  });

  const getDoctorName = (doctorId: string) => {
    const p = profiles?.find((pr) => pr.id === doctorId);
    return p?.full_name || p?.email || 'Unknown';
  };

  const getMyRole = (appraisalId: string) => {
    const resp = myResponses?.find((r) => r.appraisal_id === appraisalId);
    return resp?.evaluator_role;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ClipboardCheck className="h-6 w-6 text-primary" />
            Performance Appraisal
          </h1>
          <p className="text-muted-foreground text-sm mt-1">360° Medical Doctor Evaluation</p>
        </div>
        {isAdmin && (
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4 mr-2" />New Appraisal</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create New Appraisal</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>Doctor</Label>
                  <Select value={selectedDoctor} onValueChange={setSelectedDoctor}>
                    <SelectTrigger><SelectValue placeholder="Select doctor" /></SelectTrigger>
                    <SelectContent>
                      {profiles?.map((p) => (
                        <SelectItem key={p.id} value={p.id}>{p.full_name || p.email}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Period From</Label>
                    <Input type="date" value={periodFrom} onChange={(e) => setPeriodFrom(e.target.value)} />
                  </div>
                  <div>
                    <Label>Period To</Label>
                    <Input type="date" value={periodTo} onChange={(e) => setPeriodTo(e.target.value)} />
                  </div>
                </div>
                <Button
                  className="w-full"
                  disabled={!selectedDoctor || !periodFrom || !periodTo || createMutation.isPending}
                  onClick={() => createMutation.mutate()}
                >
                  {createMutation.isPending ? 'Creating...' : 'Create Appraisal'}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Loading appraisals...</div>
      ) : !appraisals?.length ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No appraisals found. {isAdmin ? 'Create one to get started.' : 'Your admin will create appraisals for you.'}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {appraisals.map((appraisal) => (
            <Card
              key={appraisal.id}
              className="cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => navigate(`/staff/appraisal/${appraisal.id}`)}
            >
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">
                    {isAdmin ? getDoctorName(appraisal.doctor_id) : 'My Appraisal'}
                  </CardTitle>
                  <Badge className={statusColors[appraisal.status] || ''}>
                    {appraisal.status}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Calendar className="h-3.5 w-3.5" />
                  {format(new Date(appraisal.appraisal_period_from), 'dd MMM yyyy')} – {format(new Date(appraisal.appraisal_period_to), 'dd MMM yyyy')}
                </div>
                {getMyRole(appraisal.id) && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <User className="h-3.5 w-3.5" />
                    Your role: {getMyRole(appraisal.id)}
                  </div>
                )}
                {appraisal.overall_weighted_score != null && (
                  <div className="font-semibold text-primary">
                    Score: {Number(appraisal.overall_weighted_score).toFixed(2)} / 5.0
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
