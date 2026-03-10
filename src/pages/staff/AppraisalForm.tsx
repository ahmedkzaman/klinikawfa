import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { ArrowLeft, Save, Send, Plus, UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import {
  RATING_LABELS, CLINICAL_CRITERIA, PATIENT_CRITERIA, ATTENDANCE_CRITERIA,
  DOCTOR_KPIS, SECTION_WEIGHTS, EVALUATOR_ROLES,
} from '@/lib/appraisalConstants';

type KpiResponse = { kpi_number: number; target: string; actual_result: string; status: string; comments: string };
type DevObjective = { objective: string; action: string; resources: string; target_date: string; success_measure: string };

function RatingSelect({ value, onChange, disabled }: { value: number | null; onChange: (v: number) => void; disabled?: boolean }) {
  return (
    <Select value={value?.toString() || ''} onValueChange={(v) => onChange(Number(v))} disabled={disabled}>
      <SelectTrigger className="w-full">
        <SelectValue placeholder="Rate 1-5" />
      </SelectTrigger>
      <SelectContent>
        {[1, 2, 3, 4, 5].map((r) => (
          <SelectItem key={r} value={r.toString()}>{r} – {RATING_LABELS[r]}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function CriteriaSection({
  criteria,
  data,
  onChange,
  disabled,
}: {
  criteria: readonly { key: string; label: string; description: string }[];
  data: Record<string, any>;
  onChange: (key: string, field: 'rating' | 'evidence', value: any) => void;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-6">
      {criteria.map((c) => (
        <div key={c.key} className="border rounded-lg p-4 space-y-3">
          <div>
            <h4 className="font-medium">{c.label}</h4>
            <p className="text-xs text-muted-foreground">{c.description}</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label className="text-xs">Rating (1–5)</Label>
              <RatingSelect
                value={data[`${c.key}_rating`] ?? null}
                onChange={(v) => onChange(c.key, 'rating', v)}
                disabled={disabled}
              />
            </div>
            <div>
              <Label className="text-xs">Evidence / Comments</Label>
              <Textarea
                value={data[`${c.key}_evidence`] || ''}
                onChange={(e) => onChange(c.key, 'evidence', e.target.value)}
                disabled={disabled}
                rows={2}
                className="text-sm"
              />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function AppraisalForm() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, isAdmin } = useAuth();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('partB');
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [kpis, setKpis] = useState<KpiResponse[]>([]);
  const [devObjectives, setDevObjectives] = useState<DevObjective[]>([]);
  const [staffObjectives, setStaffObjectives] = useState<DevObjective[]>([]);
  const [addEvaluatorOpen, setAddEvaluatorOpen] = useState(false);
  const [newEvalId, setNewEvalId] = useState('');
  const [newEvalRole, setNewEvalRole] = useState('');

  // Fetch appraisal
  const { data: appraisal } = useQuery({
    queryKey: ['appraisal', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('performance_appraisals')
        .select('*')
        .eq('id', id!)
        .single();
      if (error) throw error;
      return data;
    },
  });

  // Fetch all responses for this appraisal
  const { data: responses } = useQuery({
    queryKey: ['appraisal-responses', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('appraisal_responses')
        .select('*')
        .eq('appraisal_id', id!);
      if (error) throw error;
      return data;
    },
  });

  // Fetch profiles for evaluator names
  const { data: profiles } = useQuery({
    queryKey: ['profiles-for-appraisal'],
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles').select('id, full_name, email');
      if (error) throw error;
      return data;
    },
  });

  // Current user's response
  const myResponse = responses?.find((r) => r.evaluator_id === user?.id);
  const selfResponse = responses?.find((r) => r.evaluator_role === 'Self');
  const isDoctor = user?.id === appraisal?.doctor_id;
  const isSelfEvaluator = myResponse?.evaluator_role === 'Self';
  const isReadOnly = myResponse?.status === 'submitted' && !isAdmin;

  // Load form data from response
  useEffect(() => {
    if (myResponse) {
      setFormData(myResponse);
      const savedKpis = Array.isArray(myResponse.kpi_responses) && (myResponse.kpi_responses as KpiResponse[]).length > 0
        ? (myResponse.kpi_responses as KpiResponse[])
        : initKpis();
      setKpis(savedKpis);
      setDevObjectives(Array.isArray(myResponse.development_objectives) ? (myResponse.development_objectives as DevObjective[]) : []);
    } else {
      setKpis(initKpis());
    }
  }, [myResponse]);

  // Load staff's own objectives from Self response
  useEffect(() => {
    if (selfResponse) {
      setStaffObjectives(
        Array.isArray(selfResponse.development_objectives) && (selfResponse.development_objectives as DevObjective[]).length > 0
          ? (selfResponse.development_objectives as DevObjective[])
          : []
      );
    }
  }, [selfResponse]);

  function initKpis(): KpiResponse[] {
    return DOCTOR_KPIS.map((k) => ({
      kpi_number: k.number,
      target: k.target,
      actual_result: '',
      status: '',
      comments: '',
    }));
  }

  const updateField = (key: string, field: 'rating' | 'evidence', value: any) => {
    setFormData((prev) => ({ ...prev, [`${key}_${field}`]: value }));
  };

  const updateMetric = (key: string, value: any) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
  };

  // Calculate section scores
  function calcSectionScore(criteria: readonly { key: string }[]) {
    const ratings = criteria.map((c) => formData[`${c.key}_rating`]).filter((r) => r != null);
    if (!ratings.length) return null;
    return ratings.reduce((a: number, b: number) => a + b, 0) / ratings.length;
  }

  const sectionBScore = calcSectionScore(CLINICAL_CRITERIA);
  const sectionCScore = calcSectionScore(PATIENT_CRITERIA);
  const sectionDScore = calcSectionScore(ATTENDANCE_CRITERIA);

  function calcKpiScore() {
    const scored = kpis.filter((k) => k.status);
    if (!scored.length) return null;
    const statusMap: Record<string, number> = { Met: 5, Partial: 3, 'Not Met': 1 };
    const total = scored.reduce((sum, k) => sum + (statusMap[k.status] || 0), 0);
    return total / scored.length;
  }
  const sectionEScore = calcKpiScore();

  function calcOverall() {
    if (sectionBScore == null || sectionCScore == null || sectionDScore == null || sectionEScore == null) return null;
    return (
      sectionBScore * SECTION_WEIGHTS.B +
      sectionCScore * SECTION_WEIGHTS.C +
      sectionDScore * SECTION_WEIGHTS.D +
      sectionEScore * SECTION_WEIGHTS.E
    );
  }

  const saveMutation = useMutation({
    mutationFn: async (submit: boolean) => {
      if (!myResponse) throw new Error('No response record found');
      const payload: Record<string, any> = {};

      // Part B
      CLINICAL_CRITERIA.forEach((c) => {
        payload[`${c.key}_rating`] = formData[`${c.key}_rating`] ?? null;
        payload[`${c.key}_evidence`] = formData[`${c.key}_evidence`] || null;
      });
      payload.clinical_strength_summary = formData.clinical_strength_summary || null;
      payload.clinical_development_summary = formData.clinical_development_summary || null;

      // Part C metrics
      ['patient_satisfaction_score', 'patient_satisfaction_source', 'patient_reviews_count',
       'patient_complaints_count', 'complaints_resolved', 'complaints_pending'].forEach((k) => {
        payload[k] = formData[k] ?? null;
      });
      PATIENT_CRITERIA.forEach((c) => {
        payload[`${c.key}_rating`] = formData[`${c.key}_rating`] ?? null;
        payload[`${c.key}_evidence`] = formData[`${c.key}_evidence`] || null;
      });
      payload.challenging_case_summary = formData.challenging_case_summary || null;

      // Part D metrics
      ['total_working_days', 'days_present', 'approved_leave_days', 'unapproved_absences',
       'late_arrivals', 'early_departures'].forEach((k) => {
        payload[k] = formData[k] ?? null;
      });
      ATTENDANCE_CRITERIA.forEach((c) => {
        payload[`${c.key}_rating`] = formData[`${c.key}_rating`] ?? null;
        payload[`${c.key}_evidence`] = formData[`${c.key}_evidence`] || null;
      });
      payload.attendance_overall_comments = formData.attendance_overall_comments || null;

      // Part E & G
      payload.kpi_responses = kpis;
      payload.development_objectives = devObjectives;

      // Part F scores
      payload.section_b_score = sectionBScore;
      payload.section_c_score = sectionCScore;
      payload.section_d_score = sectionDScore;
      payload.section_e_score = sectionEScore;

      if (submit) payload.status = 'submitted';

      const { error } = await supabase
        .from('appraisal_responses')
        .update(payload)
        .eq('id', myResponse.id);
      if (error) throw error;

      // If admin submitting, also update overall score
      if (isAdmin && submit) {
        const overall = calcOverall();
        if (overall != null) {
          await supabase
            .from('performance_appraisals')
            .update({ overall_weighted_score: overall, status: 'reviewed' })
            .eq('id', id!);
        }
      }
    },
    onSuccess: (_, submit) => {
      toast.success(submit ? 'Appraisal submitted!' : 'Draft saved');
      queryClient.invalidateQueries({ queryKey: ['appraisal-responses', id] });
      queryClient.invalidateQueries({ queryKey: ['appraisal', id] });
    },
    onError: (err: any) => toast.error(err.message),
  });

  const addEvaluatorMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('appraisal_responses').insert({
        appraisal_id: id!,
        evaluator_id: newEvalId,
        evaluator_role: newEvalRole,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Evaluator added');
      queryClient.invalidateQueries({ queryKey: ['appraisal-responses', id] });
      setAddEvaluatorOpen(false);
      setNewEvalId('');
      setNewEvalRole('');
    },
    onError: (err: any) => toast.error(err.message),
  });

  const getProfileName = (uid: string) => profiles?.find((p) => p.id === uid)?.full_name || profiles?.find((p) => p.id === uid)?.email || uid;

  if (!appraisal) return <div className="py-12 text-center text-muted-foreground">Loading...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate('/staff/appraisal')}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-xl font-bold">360° Doctor Performance Appraisal</h1>
          <p className="text-sm text-muted-foreground">
            Period: {appraisal.appraisal_period_from} to {appraisal.appraisal_period_to}
          </p>
        </div>
        <Badge>{appraisal.status}</Badge>
      </div>

      {/* Evaluators overview (admin) */}
      {isAdmin && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm">Evaluators</CardTitle>
              <Dialog open={addEvaluatorOpen} onOpenChange={setAddEvaluatorOpen}>
                <DialogTrigger asChild>
                  <Button size="sm" variant="outline"><UserPlus className="h-3.5 w-3.5 mr-1" />Add</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader><DialogTitle>Add Evaluator</DialogTitle></DialogHeader>
                  <div className="space-y-4">
                    <div>
                      <Label>Staff Member</Label>
                      <Select value={newEvalId} onValueChange={setNewEvalId}>
                        <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                        <SelectContent>
                          {profiles?.map((p) => (
                            <SelectItem key={p.id} value={p.id}>{p.full_name || p.email}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Role</Label>
                      <Select value={newEvalRole} onValueChange={setNewEvalRole}>
                        <SelectTrigger><SelectValue placeholder="Select role" /></SelectTrigger>
                        <SelectContent>
                          {EVALUATOR_ROLES.filter((r) => r !== 'Self').map((r) => (
                            <SelectItem key={r} value={r}>{r}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <Button className="w-full" disabled={!newEvalId || !newEvalRole} onClick={() => addEvaluatorMutation.mutate()}>
                      Add Evaluator
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {responses?.map((r) => (
                <Badge key={r.id} variant={r.status === 'submitted' ? 'default' : 'outline'}>
                  {getProfileName(r.evaluator_id)} ({r.evaluator_role}) – {r.status}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {!myResponse ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            You are not assigned as an evaluator for this appraisal.
            {isAdmin && ' Use the "Add" button above to assign yourself.'}
          </CardContent>
        </Card>
      ) : (
        <>
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="w-full flex flex-wrap h-auto gap-1">
              <TabsTrigger value="partB" className="text-xs">B: Clinical</TabsTrigger>
              <TabsTrigger value="partC" className="text-xs">C: Patient</TabsTrigger>
              <TabsTrigger value="partD" className="text-xs">D: Attendance</TabsTrigger>
              <TabsTrigger value="partE" className="text-xs">E: KPIs</TabsTrigger>
              <TabsTrigger value="partF" className="text-xs">F: Summary</TabsTrigger>
              <TabsTrigger value="partG" className="text-xs">G: Development</TabsTrigger>
            </TabsList>

            {/* Part B */}
            <TabsContent value="partB">
              <Card>
                <CardHeader>
                  <CardTitle>Part B — Clinical Skills & Competency</CardTitle>
                  <CardDescription>Rate each competency using the 1–5 scale and provide evidence.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <CriteriaSection criteria={CLINICAL_CRITERIA} data={formData} onChange={updateField} disabled={isReadOnly} />
                  <div className="border-t pt-4 space-y-4">
                    <div>
                      <Label>Greatest clinical strength during this period</Label>
                      <Textarea value={formData.clinical_strength_summary || ''} onChange={(e) => updateMetric('clinical_strength_summary', e.target.value)} disabled={isReadOnly} />
                    </div>
                    <div>
                      <Label>Clinical area(s) needing most development</Label>
                      <Textarea value={formData.clinical_development_summary || ''} onChange={(e) => updateMetric('clinical_development_summary', e.target.value)} disabled={isReadOnly} />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Part C */}
            <TabsContent value="partC">
              <Card>
                <CardHeader>
                  <CardTitle>Part C — Patient Satisfaction & Communication</CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 border rounded-lg p-4">
                    <div>
                      <Label className="text-xs">Patient Satisfaction Score (/5.0)</Label>
                      <Input type="number" step="0.1" min="0" max="5" value={formData.patient_satisfaction_score ?? ''} onChange={(e) => updateMetric('patient_satisfaction_score', e.target.value)} disabled={isReadOnly} />
                    </div>
                    <div>
                      <Label className="text-xs">Source</Label>
                      <Input value={formData.patient_satisfaction_source || ''} onChange={(e) => updateMetric('patient_satisfaction_source', e.target.value)} disabled={isReadOnly} />
                    </div>
                    <div>
                      <Label className="text-xs">No. of Patient Reviews</Label>
                      <Input type="number" value={formData.patient_reviews_count ?? ''} onChange={(e) => updateMetric('patient_reviews_count', e.target.value)} disabled={isReadOnly} />
                    </div>
                    <div>
                      <Label className="text-xs">No. of Formal Complaints</Label>
                      <Input type="number" value={formData.patient_complaints_count ?? ''} onChange={(e) => updateMetric('patient_complaints_count', e.target.value)} disabled={isReadOnly} />
                    </div>
                    <div>
                      <Label className="text-xs">Resolved</Label>
                      <Input type="number" value={formData.complaints_resolved ?? ''} onChange={(e) => updateMetric('complaints_resolved', e.target.value)} disabled={isReadOnly} />
                    </div>
                    <div>
                      <Label className="text-xs">Pending</Label>
                      <Input type="number" value={formData.complaints_pending ?? ''} onChange={(e) => updateMetric('complaints_pending', e.target.value)} disabled={isReadOnly} />
                    </div>
                  </div>
                  <CriteriaSection criteria={PATIENT_CRITERIA} data={formData} onChange={updateField} disabled={isReadOnly} />
                  <div className="border-t pt-4">
                    <Label>Challenging clinical case or situation managed during this period</Label>
                    <Textarea value={formData.challenging_case_summary || ''} onChange={(e) => updateMetric('challenging_case_summary', e.target.value)} disabled={isReadOnly} />
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Part D */}
            <TabsContent value="partD">
              <Card>
                <CardHeader>
                  <CardTitle>Part D — Attendance & Punctuality</CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4 border rounded-lg p-4">
                    {[
                      { key: 'total_working_days', label: 'Total Working Days' },
                      { key: 'days_present', label: 'Days Present' },
                      { key: 'approved_leave_days', label: 'Approved Leave' },
                      { key: 'unapproved_absences', label: 'Unapproved Absences' },
                      { key: 'late_arrivals', label: 'Late Arrivals (>10 min)' },
                      { key: 'early_departures', label: 'Early Departures' },
                    ].map((m) => (
                      <div key={m.key}>
                        <Label className="text-xs">{m.label}</Label>
                        <Input type="number" value={formData[m.key] ?? ''} onChange={(e) => updateMetric(m.key, e.target.value)} disabled={isReadOnly} />
                      </div>
                    ))}
                  </div>
                  {formData.total_working_days && formData.days_present && (
                    <div className="text-sm text-muted-foreground">
                      Attendance Rate: {((Number(formData.days_present) / Number(formData.total_working_days)) * 100).toFixed(1)}%
                    </div>
                  )}
                  <CriteriaSection criteria={ATTENDANCE_CRITERIA} data={formData} onChange={updateField} disabled={isReadOnly} />
                  <div className="border-t pt-4">
                    <Label>Overall Comments — Attendance</Label>
                    <Textarea value={formData.attendance_overall_comments || ''} onChange={(e) => updateMetric('attendance_overall_comments', e.target.value)} disabled={isReadOnly} />
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Part E */}
            <TabsContent value="partE">
              <Card>
                <CardHeader>
                  <CardTitle>Part E — Key Performance Indicators (KPIs)</CardTitle>
                  <CardDescription>Evaluate performance against the 13 agreed KPIs.</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {kpis.map((kpi, idx) => {
                      const def = DOCTOR_KPIS.find((k) => k.number === kpi.kpi_number);
                      return (
                        <div key={kpi.kpi_number} className="border rounded-lg p-4 space-y-3">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <span className="font-medium text-sm">{kpi.kpi_number}. {def?.description}</span>
                              <p className="text-xs text-muted-foreground">Target: {kpi.target}</p>
                            </div>
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                            <div>
                              <Label className="text-xs">Actual Result</Label>
                              <Input
                                value={kpi.actual_result}
                                onChange={(e) => {
                                  const updated = [...kpis];
                                  updated[idx] = { ...updated[idx], actual_result: e.target.value };
                                  setKpis(updated);
                                }}
                                disabled={isReadOnly}
                              />
                            </div>
                            <div>
                              <Label className="text-xs">Status</Label>
                              <Select
                                value={kpi.status}
                                onValueChange={(v) => {
                                  const updated = [...kpis];
                                  updated[idx] = { ...updated[idx], status: v };
                                  setKpis(updated);
                                }}
                                disabled={isReadOnly}
                              >
                                <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="Met">Met</SelectItem>
                                  <SelectItem value="Partial">Partial</SelectItem>
                                  <SelectItem value="Not Met">Not Met</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            <div>
                              <Label className="text-xs">Comments</Label>
                              <Input
                                value={kpi.comments}
                                onChange={(e) => {
                                  const updated = [...kpis];
                                  updated[idx] = { ...updated[idx], comments: e.target.value };
                                  setKpis(updated);
                                }}
                                disabled={isReadOnly}
                              />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Part F */}
            <TabsContent value="partF">
              <Card>
                <CardHeader>
                  <CardTitle>Part F — Overall Performance Summary</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {[
                      { label: 'Part B — Clinical Skills & Competency', score: sectionBScore, weight: '30%' },
                      { label: 'Part C — Patient Satisfaction & Communication', score: sectionCScore, weight: '30%' },
                      { label: 'Part D — Attendance & Punctuality', score: sectionDScore, weight: '20%' },
                      { label: 'Part E — KPIs & Targets', score: sectionEScore, weight: '20%' },
                    ].map((s) => (
                      <div key={s.label} className="flex items-center justify-between border rounded-lg p-4">
                        <div>
                          <div className="font-medium text-sm">{s.label}</div>
                          <div className="text-xs text-muted-foreground">Weighting: {s.weight}</div>
                        </div>
                        <div className="text-lg font-bold text-primary">
                          {s.score != null ? s.score.toFixed(2) : '—'} / 5.0
                        </div>
                      </div>
                    ))}
                    <div className="border-t pt-4 flex items-center justify-between">
                      <span className="text-lg font-bold">Overall Weighted Score</span>
                      <span className="text-2xl font-bold text-primary">
                        {calcOverall() != null ? calcOverall()!.toFixed(2) : '—'} / 5.0
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Part G */}
            <TabsContent value="partG">
              <Card>
                <CardHeader>
                  <CardTitle>Part G — Development Plan & Next Period Objectives</CardTitle>
                  <CardDescription>Set SMART objectives for the next appraisal period.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {devObjectives.map((obj, idx) => (
                    <div key={idx} className="border rounded-lg p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-sm">Objective {idx + 1}</span>
                        {!isReadOnly && (
                          <Button variant="ghost" size="sm" onClick={() => setDevObjectives(devObjectives.filter((_, i) => i !== idx))}>
                            Remove
                          </Button>
                        )}
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                          <Label className="text-xs">Objective / Goal</Label>
                          <Input value={obj.objective} onChange={(e) => { const u = [...devObjectives]; u[idx] = { ...u[idx], objective: e.target.value }; setDevObjectives(u); }} disabled={isReadOnly} />
                        </div>
                        <div>
                          <Label className="text-xs">Action / Development Activity</Label>
                          <Input value={obj.action} onChange={(e) => { const u = [...devObjectives]; u[idx] = { ...u[idx], action: e.target.value }; setDevObjectives(u); }} disabled={isReadOnly} />
                        </div>
                        <div>
                          <Label className="text-xs">Resources Needed</Label>
                          <Input value={obj.resources} onChange={(e) => { const u = [...devObjectives]; u[idx] = { ...u[idx], resources: e.target.value }; setDevObjectives(u); }} disabled={isReadOnly} />
                        </div>
                        <div>
                          <Label className="text-xs">Target Date</Label>
                          <Input type="date" value={obj.target_date} onChange={(e) => { const u = [...devObjectives]; u[idx] = { ...u[idx], target_date: e.target.value }; setDevObjectives(u); }} disabled={isReadOnly} />
                        </div>
                        <div className="md:col-span-2">
                          <Label className="text-xs">Success Measure</Label>
                          <Input value={obj.success_measure} onChange={(e) => { const u = [...devObjectives]; u[idx] = { ...u[idx], success_measure: e.target.value }; setDevObjectives(u); }} disabled={isReadOnly} />
                        </div>
                      </div>
                    </div>
                  ))}
                  {!isReadOnly && (
                    <Button variant="outline" onClick={() => setDevObjectives([...devObjectives, { objective: '', action: '', resources: '', target_date: '', success_measure: '' }])}>
                      <Plus className="h-4 w-4 mr-2" />Add Objective
                    </Button>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>

          {!isReadOnly && (
            <div className="flex gap-3 justify-end">
              <Button variant="outline" onClick={() => saveMutation.mutate(false)} disabled={saveMutation.isPending}>
                <Save className="h-4 w-4 mr-2" />Save Draft
              </Button>
              <Button onClick={() => saveMutation.mutate(true)} disabled={saveMutation.isPending}>
                <Send className="h-4 w-4 mr-2" />Submit
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
