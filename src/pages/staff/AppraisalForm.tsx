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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ArrowLeft, Save, Send, Plus, UserPlus, CheckCircle, ClipboardCheck } from 'lucide-react';
import { toast } from 'sonner';
import {
  RATING_LABELS, CLINICAL_CRITERIA, PATIENT_CRITERIA, ATTENDANCE_CRITERIA,
  DOCTOR_KPIS, SECTION_WEIGHTS, EVALUATOR_ROLES,
  CA_COMPETENCY_CATEGORIES, CA_KPIS, CA_SECTION_WEIGHTS, CA_EVALUATOR_ROLES,
  SN_COMPETENCY_CATEGORIES, SN_KPIS, SN_SECTION_WEIGHTS, SN_EVALUATOR_ROLES,
  APPRAISAL_TYPE_LABELS, type AppraisalType,
} from '@/lib/appraisalConstants';

type KpiResponse = { kpi_number: number; target: string; actual_result: string; status: string; comments: string };
type DevObjective = { objective: string; action: string; resources: string; target_date: string; success_measure: string };
type CompetencyResponse = Record<string, { rating: number | null; evidence: string }>;

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

/* ─── Generic Competency Section (works for CA and SN) ─── */
function CACompetencySection({
  categories,
  competencyData,
  onChange,
  disabled,
}: {
  categories: readonly { key: string; label: string; indicators: readonly { key: string; label: string; description: string }[] }[];
  competencyData: CompetencyResponse;
  onChange: (key: string, field: 'rating' | 'evidence', value: any) => void;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-8">
      {categories.map((cat) => (
        <div key={cat.key}>
          <h3 className="font-semibold text-base mb-4">{cat.label}</h3>
          <div className="space-y-4">
            {cat.indicators.map((ind) => (
              <div key={ind.key} className="border rounded-lg p-4 space-y-3">
                <div>
                  <h4 className="font-medium text-sm">{ind.label}</h4>
                  <p className="text-xs text-muted-foreground">{ind.description}</p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label className="text-xs">Rating (1–5)</Label>
                    <RatingSelect
                      value={competencyData[ind.key]?.rating ?? null}
                      onChange={(v) => onChange(ind.key, 'rating', v)}
                      disabled={disabled}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Evidence / Comments</Label>
                    <Textarea
                      value={competencyData[ind.key]?.evidence || ''}
                      onChange={(e) => onChange(ind.key, 'evidence', e.target.value)}
                      disabled={disabled}
                      rows={2}
                      className="text-sm"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ─── Review Panel ─── */
function ReviewPanel({
  responses,
  appraisal,
  getProfileName,
  appraisalId,
  queryClient,
  appraisalType,
}: {
  responses: any[];
  appraisal: any;
  getProfileName: (uid: string) => string;
  appraisalId: string;
  queryClient: any;
  appraisalType: AppraisalType;
}) {
  const isCA = appraisalType === 'clinic_assistant';
  const isSN = appraisalType === 'staff_nurse';
  const isCompetencyBased = isCA || isSN;
  const competencyCategories = isSN ? SN_COMPETENCY_CATEGORIES : CA_COMPETENCY_CATEGORIES;
  const ROLES = isCompetencyBased ? (isSN ? SN_EVALUATOR_ROLES : CA_EVALUATOR_ROLES) : EVALUATOR_ROLES;
  const weights = isCompetencyBased ? (isSN ? SN_SECTION_WEIGHTS : CA_SECTION_WEIGHTS) : SECTION_WEIGHTS;
  const submitted = responses.filter((r) => r.status === 'submitted');
  const byRole = (role: string) => submitted.find((r) => r.evaluator_role === role);

  function getRating(role: string, key: string): number | null {
    const resp = byRole(role);
    if (isCompetencyBased) {
      const cr = resp?.competency_responses as CompetencyResponse | null;
      return cr?.[key]?.rating ?? null;
    }
    return resp?.[`${key}_rating`] ?? null;
  }

  function getAvg(key: string): string {
    const vals = ROLES.map((r) => getRating(r, key)).filter((v): v is number => v != null);
    if (!vals.length) return '—';
    return (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1);
  }

  function getSectionScore(role: string, section: string): number | null {
    const resp = byRole(role);
    return resp?.[`section_${section}_score`] ?? null;
  }

  function getOverallAvg(): number | null {
    const scores = submitted
      .map((r) => {
        const b = r.section_b_score, c = r.section_c_score, d = r.section_d_score, e = r.section_e_score;
        if (b == null || c == null || d == null || e == null) return null;
        return b * weights.B + c * weights.C + d * weights.D + e * weights.E;
      })
      .filter((v): v is number => v != null);
    if (!scores.length) return null;
    return scores.reduce((a, b) => a + b, 0) / scores.length;
  }

  const finalizeMutation = useMutation({
    mutationFn: async (newStatus: string) => {
      const overall = getOverallAvg();
      const { error } = await supabase
        .from('performance_appraisals')
        .update({
          status: newStatus,
          overall_weighted_score: overall,
          date_of_appraisal: new Date().toISOString().split('T')[0],
        })
        .eq('id', appraisalId);
      if (error) throw error;
    },
    onSuccess: (_, status) => {
      toast.success(`Appraisal marked as ${status}`);
      queryClient.invalidateQueries({ queryKey: ['appraisal', appraisalId] });
    },
    onError: (err: any) => toast.error(err.message),
  });

  const selfResp = byRole('Self');
  const kpiDefs = isCompetencyBased ? (isSN ? SN_KPIS : CA_KPIS) : DOCTOR_KPIS;
  const selfKpis = selfResp?.kpi_responses as KpiResponse[] | null;

  // Build section rows for the scores table
  const sectionRows = isCA
    ? [
        { key: 'b', label: 'B: Competency (30%)', weight: weights.B },
        { key: 'c', label: 'C: KPIs (40%)', weight: weights.C },
        { key: 'd', label: 'D: Attendance (10%)', weight: weights.D },
        { key: 'e', label: 'E: Patient Feedback (10%)', weight: weights.E },
      ]
    : [
        { key: 'b', label: 'B: Clinical (30%)', weight: weights.B },
        { key: 'c', label: 'C: Patient (30%)', weight: weights.C },
        { key: 'd', label: 'D: Attendance (20%)', weight: weights.D },
        { key: 'e', label: 'E: KPIs (20%)', weight: weights.E },
      ];

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <p className="text-sm text-muted-foreground">
                {submitted.length} of {responses.length} evaluator(s) submitted
              </p>
              {getOverallAvg() != null && (
                <p className="text-lg font-bold mt-1">
                  Consolidated Score: <span className="text-primary">{getOverallAvg()!.toFixed(2)} / 5.0</span>
                </p>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => finalizeMutation.mutate('reviewed')} disabled={finalizeMutation.isPending || appraisal.status === 'completed'}>
                <ClipboardCheck className="h-4 w-4 mr-2" />Mark as Reviewed
              </Button>
              <Button onClick={() => finalizeMutation.mutate('completed')} disabled={finalizeMutation.isPending || appraisal.status === 'completed'}>
                <CheckCircle className="h-4 w-4 mr-2" />Complete & Finalize
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Criteria tables */}
      {isCA ? (
        CA_COMPETENCY_CATEGORIES.map((cat) => (
          <Card key={cat.key} className="mb-6">
            <CardHeader className="pb-3"><CardTitle className="text-base">{cat.label}</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[200px]">Indicator</TableHead>
                    {ROLES.map((r) => <TableHead key={r} className="text-center w-[80px]">{r}</TableHead>)}
                    <TableHead className="text-center w-[80px] font-bold">Avg</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {cat.indicators.map((ind) => (
                    <TableRow key={ind.key}>
                      <TableCell className="text-sm font-medium">{ind.label}</TableCell>
                      {ROLES.map((r) => {
                        const val = getRating(r, ind.key);
                        return (
                          <TableCell key={r} className="text-center">
                            {val != null ? (
                              <Badge variant={val >= 4 ? 'default' : val >= 3 ? 'secondary' : 'destructive'} className="text-xs">{val}</Badge>
                            ) : '—'}
                          </TableCell>
                        );
                      })}
                      <TableCell className="text-center font-bold text-sm">{getAvg(ind.key)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        ))
      ) : (
        <>
          <ReviewCriteriaTable title="Section B — Clinical Skills & Competency" criteria={CLINICAL_CRITERIA} roles={ROLES} getRating={getRating} getAvg={getAvg} />
          <ReviewCriteriaTable title="Section C — Patient Satisfaction & Communication" criteria={PATIENT_CRITERIA} roles={ROLES} getRating={getRating} getAvg={getAvg} />
          <ReviewCriteriaTable title="Section D — Attendance & Punctuality" criteria={ATTENDANCE_CRITERIA} roles={ROLES} getRating={getRating} getAvg={getAvg} />
        </>
      )}

      {/* KPIs from Self */}
      <Card className="mb-6">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{isCA ? 'KPIs (Self-Assessment)' : 'Section E — KPIs (Self-Assessment)'}</CardTitle>
        </CardHeader>
        <CardContent>
          {selfKpis && selfKpis.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>#</TableHead>
                  <TableHead>KPI</TableHead>
                  <TableHead>Target</TableHead>
                  <TableHead>Actual</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {selfKpis.map((k) => {
                  const def = kpiDefs.find((d) => d.number === k.kpi_number);
                  return (
                    <TableRow key={k.kpi_number}>
                      <TableCell>{k.kpi_number}</TableCell>
                      <TableCell className="text-sm">{def?.description}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{k.target}</TableCell>
                      <TableCell className="text-sm">{k.actual_result || '—'}</TableCell>
                      <TableCell>
                        {k.status ? (
                          <Badge variant={k.status === 'Met' ? 'default' : k.status === 'Partial' ? 'secondary' : 'destructive'}>{k.status}</Badge>
                        ) : '—'}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-4">No KPI data from self-assessment yet.</p>
          )}
        </CardContent>
      </Card>

      {/* Section Scores by Evaluator */}
      <Card className="mb-6">
        <CardHeader className="pb-3"><CardTitle className="text-base">Overall Scores by Evaluator</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Section</TableHead>
                {ROLES.map((r) => <TableHead key={r} className="text-center">{r}</TableHead>)}
                <TableHead className="text-center font-bold">Avg</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sectionRows.map((s) => {
                const vals = ROLES.map((r) => getSectionScore(r, s.key)).filter((v): v is number => v != null);
                const avg = vals.length ? (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2) : '—';
                return (
                  <TableRow key={s.key}>
                    <TableCell className="font-medium text-sm">{s.label}</TableCell>
                    {ROLES.map((r) => {
                      const v = getSectionScore(r, s.key);
                      return <TableCell key={r} className="text-center">{v != null ? v.toFixed(2) : '—'}</TableCell>;
                    })}
                    <TableCell className="text-center font-bold">{avg}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Development Objectives */}
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Development Objectives</CardTitle></CardHeader>
        <CardContent className="space-y-6">
          {submitted.map((resp) => {
            const objs = Array.isArray(resp.development_objectives) ? (resp.development_objectives as DevObjective[]) : [];
            if (!objs.length) return null;
            return (
              <div key={resp.id}>
                <h4 className="text-sm font-medium mb-2">{getProfileName(resp.evaluator_id)} ({resp.evaluator_role})</h4>
                <div className="space-y-2">
                  {objs.map((obj, i) => (
                    <div key={i} className="border rounded-lg p-3 text-sm space-y-1">
                      <p><span className="font-medium">Objective:</span> {obj.objective || '—'}</p>
                      <p><span className="font-medium">Action:</span> {obj.action || '—'}</p>
                      <p><span className="font-medium">Resources:</span> {obj.resources || '—'}</p>
                      <p><span className="font-medium">Target Date:</span> {obj.target_date || '—'}</p>
                      <p><span className="font-medium">Success Measure:</span> {obj.success_measure || '—'}</p>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
          {submitted.every((r) => !Array.isArray(r.development_objectives) || !(r.development_objectives as any[]).length) && (
            <p className="text-sm text-muted-foreground text-center py-4">No development objectives submitted yet.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/* Helper for doctor review tables */
function ReviewCriteriaTable({
  title,
  criteria,
  roles,
  getRating,
  getAvg,
}: {
  title: string;
  criteria: readonly { key: string; label: string }[];
  roles: readonly string[];
  getRating: (role: string, key: string) => number | null;
  getAvg: (key: string) => string;
}) {
  return (
    <Card className="mb-6">
      <CardHeader className="pb-3"><CardTitle className="text-base">{title}</CardTitle></CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[200px]">Criteria</TableHead>
              {roles.map((r) => <TableHead key={r} className="text-center w-[80px]">{r}</TableHead>)}
              <TableHead className="text-center w-[80px] font-bold">Avg</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {criteria.map((c) => (
              <TableRow key={c.key}>
                <TableCell className="text-sm font-medium">{c.label}</TableCell>
                {roles.map((r) => {
                  const val = getRating(r, c.key);
                  return (
                    <TableCell key={r} className="text-center">
                      {val != null ? (
                        <Badge variant={val >= 4 ? 'default' : val >= 3 ? 'secondary' : 'destructive'} className="text-xs">{val}</Badge>
                      ) : '—'}
                    </TableCell>
                  );
                })}
                <TableCell className="text-center font-bold text-sm">{getAvg(c.key)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

/* ─── Main Form ─── */
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
  const [competencyData, setCompetencyData] = useState<CompetencyResponse>({});
  const [addEvaluatorOpen, setAddEvaluatorOpen] = useState(false);
  const [newEvalId, setNewEvalId] = useState('');
  const [newEvalRole, setNewEvalRole] = useState('');

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

  const appraisalType: AppraisalType = ((appraisal as any)?.appraisal_type || 'doctor') as AppraisalType;
  const isCA = appraisalType === 'clinic_assistant';
  const isSN = appraisalType === 'staff_nurse';
  const isCompetencyBased = isCA || isSN;
  const competencyCategories = isSN ? SN_COMPETENCY_CATEGORIES : CA_COMPETENCY_CATEGORIES;
  const currentKpiDefs = isCompetencyBased ? (isSN ? SN_KPIS : CA_KPIS) : DOCTOR_KPIS;
  const currentWeights = isCompetencyBased ? (isSN ? SN_SECTION_WEIGHTS : CA_SECTION_WEIGHTS) : SECTION_WEIGHTS;
  const currentEvalRoles = isCompetencyBased ? (isSN ? SN_EVALUATOR_ROLES : CA_EVALUATOR_ROLES) : EVALUATOR_ROLES;

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

  const { data: profiles } = useQuery({
    queryKey: ['profiles-for-appraisal'],
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles').select('id, full_name, email');
      if (error) throw error;
      return data;
    },
  });

  const myResponse = responses?.find((r) => r.evaluator_id === user?.id);
  const selfResponse = responses?.find((r) => r.evaluator_role === 'Self');
  const isDoctor = user?.id === appraisal?.doctor_id;
  const isSelfEvaluator = myResponse?.evaluator_role === 'Self';
  const isReadOnly = myResponse?.status === 'submitted' && !isAdmin;

  useEffect(() => {
    if (myResponse) {
      setFormData(myResponse);
      const savedKpis = Array.isArray(myResponse.kpi_responses) && (myResponse.kpi_responses as KpiResponse[]).length > 0
        ? (myResponse.kpi_responses as KpiResponse[])
        : initKpis();
      setKpis(savedKpis);
      setDevObjectives(Array.isArray(myResponse.development_objectives) ? (myResponse.development_objectives as DevObjective[]) : []);
      // Load competency responses for CA
      const cr = (myResponse as any).competency_responses;
      if (cr && typeof cr === 'object' && !Array.isArray(cr)) {
        setCompetencyData(cr as CompetencyResponse);
      }
    } else {
      setKpis(initKpis());
    }
  }, [myResponse, appraisalType]);

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
    return currentKpiDefs.map((k) => ({
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

  const updateCompetencyField = (key: string, field: 'rating' | 'evidence', value: any) => {
    setCompetencyData((prev) => ({
      ...prev,
      [key]: { ...prev[key], [field]: value },
    }));
  };

  const updateMetric = (key: string, value: any) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
  };

  // ─── Section score calculations ───
  function calcSectionScore(criteria: readonly { key: string }[]) {
    const ratings = criteria.map((c) => formData[`${c.key}_rating`]).filter((r) => r != null);
    if (!ratings.length) return null;
    return ratings.reduce((a: number, b: number) => a + b, 0) / ratings.length;
  }

  function calcCACompetencyScore(): number | null {
    const allIndicators = CA_COMPETENCY_CATEGORIES.flatMap((c) => [...c.indicators]);
    const ratings = allIndicators.map((ind: { key: string }) => competencyData[ind.key]?.rating).filter((r): r is number => r != null);
    if (!ratings.length) return null;
    return ratings.reduce((a, b) => a + b, 0) / ratings.length;
  }

  const sectionBScore = isCA ? calcCACompetencyScore() : calcSectionScore(CLINICAL_CRITERIA);
  const sectionCScore = isCA ? calcKpiScore() : calcSectionScore(PATIENT_CRITERIA);
  const sectionDScore = calcSectionScore(ATTENDANCE_CRITERIA);

  function calcKpiScore() {
    const scored = kpis.filter((k) => k.status);
    if (!scored.length) return null;
    const statusMap: Record<string, number> = { Met: 5, Partial: 3, 'Not Met': 1 };
    const total = scored.reduce((sum, k) => sum + (statusMap[k.status] || 0), 0);
    return total / scored.length;
  }
  const sectionEScore = isCA ? null : calcKpiScore(); // For doctors, E=KPIs; for CA, C=KPIs

  // For CA: patient feedback score from formData
  const caPatientFeedbackScore = isCA ? (formData.patient_satisfaction_score ? Number(formData.patient_satisfaction_score) : null) : null;

  function calcOverall() {
    if (isCA) {
      const b = sectionBScore;
      const c = sectionCScore; // KPI score
      const d = sectionDScore;
      const e = caPatientFeedbackScore; // patient feedback
      if (b == null || c == null || d == null || e == null) return null;
      return b * CA_SECTION_WEIGHTS.B + c * CA_SECTION_WEIGHTS.C + d * CA_SECTION_WEIGHTS.D + e * CA_SECTION_WEIGHTS.E;
    }
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

      if (isCA) {
        // Save competency data as JSONB
        payload.competency_responses = competencyData;
      } else {
        // Part B (Doctor)
        CLINICAL_CRITERIA.forEach((c) => {
          payload[`${c.key}_rating`] = formData[`${c.key}_rating`] ?? null;
          payload[`${c.key}_evidence`] = formData[`${c.key}_evidence`] || null;
        });
        payload.clinical_strength_summary = formData.clinical_strength_summary || null;
        payload.clinical_development_summary = formData.clinical_development_summary || null;

        // Part C metrics (Doctor)
        ['patient_satisfaction_score', 'patient_satisfaction_source', 'patient_reviews_count',
         'patient_complaints_count', 'complaints_resolved', 'complaints_pending'].forEach((k) => {
          payload[k] = formData[k] ?? null;
        });
        PATIENT_CRITERIA.forEach((c) => {
          payload[`${c.key}_rating`] = formData[`${c.key}_rating`] ?? null;
          payload[`${c.key}_evidence`] = formData[`${c.key}_evidence`] || null;
        });
        payload.challenging_case_summary = formData.challenging_case_summary || null;
      }

      // Attendance (shared)
      ['total_working_days', 'days_present', 'approved_leave_days', 'unapproved_absences',
       'late_arrivals', 'early_departures'].forEach((k) => {
        payload[k] = formData[k] ?? null;
      });
      ATTENDANCE_CRITERIA.forEach((c) => {
        payload[`${c.key}_rating`] = formData[`${c.key}_rating`] ?? null;
        payload[`${c.key}_evidence`] = formData[`${c.key}_evidence`] || null;
      });
      payload.attendance_overall_comments = formData.attendance_overall_comments || null;

      // Patient feedback metrics (shared for CA too)
      if (isCA) {
        ['patient_satisfaction_score', 'patient_satisfaction_source', 'patient_reviews_count',
         'patient_complaints_count', 'complaints_resolved', 'complaints_pending'].forEach((k) => {
          payload[k] = formData[k] ?? null;
        });
      }

      // KPIs & Development
      payload.kpi_responses = kpis;
      payload.development_objectives = isSelfEvaluator ? staffObjectives : devObjectives;

      // Scores
      payload.section_b_score = sectionBScore;
      payload.section_c_score = isCA ? sectionCScore : calcSectionScore(PATIENT_CRITERIA);
      payload.section_d_score = sectionDScore;
      payload.section_e_score = isCA ? caPatientFeedbackScore : sectionEScore;

      if (submit) payload.status = 'submitted';

      const { error } = await supabase
        .from('appraisal_responses')
        .update(payload)
        .eq('id', myResponse.id);
      if (error) throw error;

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

  const formTitle = isCA ? 'Clinic Assistant Performance Appraisal' : '360° Doctor Performance Appraisal';

  // Tab config based on type
  const tabs = isCA
    ? [
        { value: 'partB', label: 'B: Competency' },
        { value: 'partC', label: 'C: KPIs' },
        { value: 'partD', label: 'D: Attendance' },
        { value: 'partE', label: 'E: Patient Feedback' },
        { value: 'partF', label: 'F: Summary' },
        { value: 'partG', label: 'G: Development' },
      ]
    : [
        { value: 'partB', label: 'B: Clinical' },
        { value: 'partC', label: 'C: Patient' },
        { value: 'partD', label: 'D: Attendance' },
        { value: 'partE', label: 'E: KPIs' },
        { value: 'partF', label: 'F: Summary' },
        { value: 'partG', label: 'G: Development' },
      ];

  // Summary rows for Part F
  const summaryRows = isCA
    ? [
        { label: 'Part B — Competency', score: sectionBScore, weight: '30%' },
        { label: 'Part C — KPIs', score: sectionCScore, weight: '40%' },
        { label: 'Part D — Attendance', score: sectionDScore, weight: '10%' },
        { label: 'Part E — Patient Feedback', score: caPatientFeedbackScore, weight: '10%' },
      ]
    : [
        { label: 'Part B — Clinical Skills & Competency', score: sectionBScore, weight: '30%' },
        { label: 'Part C — Patient Satisfaction & Communication', score: sectionCScore, weight: '30%' },
        { label: 'Part D — Attendance & Punctuality', score: sectionDScore, weight: '20%' },
        { label: 'Part E — KPIs & Targets', score: sectionEScore, weight: '20%' },
      ];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate('/staff/appraisal')}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-xl font-bold">{formTitle}</h1>
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
                          {currentEvalRoles.filter((r) => r !== 'Self').map((r) => (
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
              {tabs.map((t) => (
                <TabsTrigger key={t.value} value={t.value} className="text-xs">{t.label}</TabsTrigger>
              ))}
              {isAdmin && <TabsTrigger value="review" className="text-xs">📊 Review All</TabsTrigger>}
            </TabsList>

            {/* Part B */}
            <TabsContent value="partB">
              <Card>
                <CardHeader>
                  <CardTitle>{isCA ? 'Part B — Competency Assessment' : 'Part B — Clinical Skills & Competency'}</CardTitle>
                  <CardDescription>Rate each {isCA ? 'competency indicator' : 'competency'} using the 1–5 scale and provide evidence.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {isCA ? (
                    <CACompetencySection competencyData={competencyData} onChange={updateCompetencyField} disabled={isReadOnly} />
                  ) : (
                    <>
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
                    </>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Part C */}
            <TabsContent value="partC">
              <Card>
                <CardHeader>
                  <CardTitle>{isCA ? 'Part C — Key Performance Indicators (KPIs)' : 'Part C — Patient Satisfaction & Communication'}</CardTitle>
                  {isCA && <CardDescription>Evaluate performance against the {CA_KPIS.length} agreed KPIs.</CardDescription>}
                </CardHeader>
                <CardContent className="space-y-6">
                  {isCA ? (
                    /* CA KPIs */
                    <div className="space-y-4">
                      {kpis.map((kpi, idx) => {
                        const def = CA_KPIS.find((k) => k.number === kpi.kpi_number);
                        return (
                          <div key={kpi.kpi_number} className="border rounded-lg p-4 space-y-3">
                            <div>
                              <span className="font-medium text-sm">{kpi.kpi_number}. {def?.description}</span>
                              <p className="text-xs text-muted-foreground">Target: {kpi.target}</p>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                              <div>
                                <Label className="text-xs">Actual Result</Label>
                                <Input value={kpi.actual_result} onChange={(e) => { const u = [...kpis]; u[idx] = { ...u[idx], actual_result: e.target.value }; setKpis(u); }} disabled={isReadOnly} />
                              </div>
                              <div>
                                <Label className="text-xs">Status</Label>
                                <Select value={kpi.status} onValueChange={(v) => { const u = [...kpis]; u[idx] = { ...u[idx], status: v }; setKpis(u); }} disabled={isReadOnly}>
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
                                <Input value={kpi.comments} onChange={(e) => { const u = [...kpis]; u[idx] = { ...u[idx], comments: e.target.value }; setKpis(u); }} disabled={isReadOnly} />
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    /* Doctor Patient Satisfaction */
                    <>
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
                    </>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Part D — Attendance (shared) */}
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
                  <CardTitle>{isCA ? 'Part E — Patient Feedback' : 'Part E — Key Performance Indicators (KPIs)'}</CardTitle>
                  {!isCA && <CardDescription>Evaluate performance against the 13 agreed KPIs.</CardDescription>}
                </CardHeader>
                <CardContent>
                  {isCA ? (
                    /* CA Patient Feedback */
                    <div className="space-y-6">
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
                    </div>
                  ) : (
                    /* Doctor KPIs */
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
                                <Input value={kpi.actual_result} onChange={(e) => { const u = [...kpis]; u[idx] = { ...u[idx], actual_result: e.target.value }; setKpis(u); }} disabled={isReadOnly} />
                              </div>
                              <div>
                                <Label className="text-xs">Status</Label>
                                <Select value={kpi.status} onValueChange={(v) => { const u = [...kpis]; u[idx] = { ...u[idx], status: v }; setKpis(u); }} disabled={isReadOnly}>
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
                                <Input value={kpi.comments} onChange={(e) => { const u = [...kpis]; u[idx] = { ...u[idx], comments: e.target.value }; setKpis(u); }} disabled={isReadOnly} />
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Part F — Summary */}
            <TabsContent value="partF">
              <Card>
                <CardHeader>
                  <CardTitle>Part F — Overall Performance Summary</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {summaryRows.map((s) => (
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

            {/* Part G — Development */}
            <TabsContent value="partG">
              <Card className="mb-6">
                <CardHeader>
                  <CardTitle>Staff's Own Development Plan</CardTitle>
                  <CardDescription>Self-identified development objectives and goals.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {staffObjectives.length === 0 && !isSelfEvaluator && (
                    <p className="text-sm text-muted-foreground text-center py-4">The staff member has not submitted their development objectives yet.</p>
                  )}
                  {staffObjectives.map((obj, idx) => (
                    <div key={idx} className="border rounded-lg p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-sm">Objective {idx + 1}</span>
                        {isSelfEvaluator && !isReadOnly && (
                          <Button variant="ghost" size="sm" onClick={() => setStaffObjectives(staffObjectives.filter((_, i) => i !== idx))}>Remove</Button>
                        )}
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                          <Label className="text-xs">Objective / Goal</Label>
                          <Input value={obj.objective} onChange={(e) => { const u = [...staffObjectives]; u[idx] = { ...u[idx], objective: e.target.value }; setStaffObjectives(u); }} disabled={!isSelfEvaluator || isReadOnly} />
                        </div>
                        <div>
                          <Label className="text-xs">Action / Development Activity</Label>
                          <Input value={obj.action} onChange={(e) => { const u = [...staffObjectives]; u[idx] = { ...u[idx], action: e.target.value }; setStaffObjectives(u); }} disabled={!isSelfEvaluator || isReadOnly} />
                        </div>
                        <div>
                          <Label className="text-xs">Resources Needed</Label>
                          <Input value={obj.resources} onChange={(e) => { const u = [...staffObjectives]; u[idx] = { ...u[idx], resources: e.target.value }; setStaffObjectives(u); }} disabled={!isSelfEvaluator || isReadOnly} />
                        </div>
                        <div>
                          <Label className="text-xs">Target Date</Label>
                          <Input type="date" value={obj.target_date} onChange={(e) => { const u = [...staffObjectives]; u[idx] = { ...u[idx], target_date: e.target.value }; setStaffObjectives(u); }} disabled={!isSelfEvaluator || isReadOnly} />
                        </div>
                        <div className="md:col-span-2">
                          <Label className="text-xs">Success Measure</Label>
                          <Input value={obj.success_measure} onChange={(e) => { const u = [...staffObjectives]; u[idx] = { ...u[idx], success_measure: e.target.value }; setStaffObjectives(u); }} disabled={!isSelfEvaluator || isReadOnly} />
                        </div>
                      </div>
                    </div>
                  ))}
                  {isSelfEvaluator && !isReadOnly && (
                    <Button variant="outline" onClick={() => setStaffObjectives([...staffObjectives, { objective: '', action: '', resources: '', target_date: '', success_measure: '' }])}>
                      <Plus className="h-4 w-4 mr-2" />Add My Objective
                    </Button>
                  )}
                </CardContent>
              </Card>

              {!isSelfEvaluator && (
                <Card>
                  <CardHeader>
                    <CardTitle>Evaluator's Development Recommendations</CardTitle>
                    <CardDescription>Your recommended objectives for the next appraisal period.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {devObjectives.map((obj, idx) => (
                      <div key={idx} className="border rounded-lg p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-sm">Recommendation {idx + 1}</span>
                          {!isReadOnly && (
                            <Button variant="ghost" size="sm" onClick={() => setDevObjectives(devObjectives.filter((_, i) => i !== idx))}>Remove</Button>
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
                        <Plus className="h-4 w-4 mr-2" />Add Recommendation
                      </Button>
                    )}
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            {/* Review All (Admin only) */}
            {isAdmin && (
              <TabsContent value="review">
                <ReviewPanel
                  responses={responses || []}
                  appraisal={appraisal}
                  getProfileName={getProfileName}
                  appraisalId={id!}
                  queryClient={queryClient}
                  appraisalType={appraisalType}
                />
              </TabsContent>
            )}
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
