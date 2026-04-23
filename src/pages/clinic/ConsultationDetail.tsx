import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Save,
  ChevronDown,
  ChevronUp,
  Search,
  Plus,
  Phone,
} from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { StatusBadge } from '@/components/clinic/StatusBadge';
import {
  useConsultationQueueEntries,
  useUpdateQueueEntry,
} from '@/hooks/clinic/useQueueEntries';
import { useCurrentDoctor } from '@/hooks/clinic/useCurrentDoctor';
import {
  useConsultation,
  useCreateConsultation,
  useUpdateConsultation,
  usePatientConsultationHistory,
} from '@/hooks/clinic/useConsultations';
import { useClinicPreferences } from '@/hooks/clinic/useClinicPreferences';
import { useVitalSigns, useRecordVitalSigns } from '@/hooks/clinic/useVitalSigns';
import {
  useConsultationItems,
  useAddConsultationItem,
  useRemoveConsultationItem,
  useUpdateConsultationItem,
} from '@/hooks/clinic/useConsultationItems';
import { useClinicAppointments } from '@/hooks/clinic/useClinicAppointments';
import { useInventoryItems } from '@/hooks/clinic/useInventoryItems';
import { useServices } from '@/hooks/clinic/useServices';
import { usePackages } from '@/hooks/clinic/usePackages';
import { useRooms } from '@/hooks/clinic/useRooms';
import { AddTreatmentBulkDialog } from '@/components/clinic/consultation/AddTreatmentBulkDialog';
import { VitalHistoryTrends } from '@/components/clinic/consultation/VitalHistoryTrends';
import {
  TreatmentItemCard,
  type TreatmentItemCardItem,
} from '@/components/clinic/consultation/TreatmentItemCard';

const PRICE_TIERS = ['SELF PAY'];

export default function ConsultationDetail() {
  const { queueEntryId } = useParams<{ queueEntryId: string }>();
  const navigate = useNavigate();
  const { data: doctor } = useCurrentDoctor();
  const { data: entries = [] } = useConsultationQueueEntries();
  const updateQueue = useUpdateQueueEntry();
  const { data: rooms = [] } = useRooms();
  const { getPreference } = useClinicPreferences();

  const entry = useMemo(
    () => entries.find((e) => e.id === queueEntryId),
    [entries, queueEntryId],
  );
  const patient = entry?.patients;

  const { data: consultation, isLoading: consultLoading } = useConsultation(queueEntryId);
  const createConsultation = useCreateConsultation();
  const updateConsultation = useUpdateConsultation();

  const { data: vitals } = useVitalSigns(queueEntryId);
  const recordVitals = useRecordVitalSigns();
  const [showVitalForm, setShowVitalForm] = useState(false);
  const [vitalForm, setVitalForm] = useState({
    height_cm: '',
    weight_kg: '',
    temperature_c: '',
    bp_systolic: '',
    bp_diastolic: '',
    heart_rate: '',
    spo2: '',
    blood_glucose: '',
    respiratory_rate: '',
  });

  const [caseNote, setCaseNote] = useState('');
  const [dispenseNote, setDispenseNote] = useState('');
  const [diagnosisText, setDiagnosisText] = useState('');

  const consultationId = (consultation as { id?: string } | null)?.id;
  const { data: items = [] } = useConsultationItems(consultationId);
  const addItem = useAddConsultationItem();
  const removeItem = useRemoveConsultationItem();
  const updateItem = useUpdateConsultationItem();

  const { items: inventoryItems } = useInventoryItems();
  const { services } = useServices();
  const { packages } = usePackages();

  const [treatmentSearch, setTreatmentSearch] = useState('');
  const [treatmentCategory, setTreatmentCategory] = useState('all');
  const [bulkDialogOpen, setBulkDialogOpen] = useState(false);

  const { data: patientAppointmentsRaw = [] } = useClinicAppointments(patient?.id);
  const patientAppointments = useMemo(
    () =>
      patientAppointmentsRaw.filter(
        (a) => new Date(a.appointment_date) >= new Date(new Date().toDateString()),
      ),
    [patientAppointmentsRaw],
  );

  const { data: history = [] } = usePatientConsultationHistory(patient?.id);
  const [historyPage, setHistoryPage] = useState(0);
  const HISTORY_PER_PAGE = 5;
  const pagedHistory = history.slice(
    historyPage * HISTORY_PER_PAGE,
    (historyPage + 1) * HISTORY_PER_PAGE,
  );

  const waitingCount = useMemo(() => {
    if (!doctor) return 0;
    return entries.filter(
      (e) =>
        e.assigned_doctor_id === doctor.id &&
        ['registered', 'ready_for_doctor'].includes(e.clinic_status),
    ).length;
  }, [entries, doctor]);

  // Auto-create consultation + seed default consultation fee
  useEffect(() => {
    if (!consultLoading && !consultation && entry && doctor) {
      createConsultation.mutate(
        {
          queue_entry_id: entry.id,
          patient_id: entry.patient_id,
          doctor_id: doctor.id,
        },
        {
          onSuccess: (newConsultation) => {
            const feeName = getPreference('default_consultation_fee_name', 'Consultation Fee');
            const feePrice = parseFloat(getPreference('default_consultation_fee_price', '0'));
            if (feeName && feePrice > 0) {
              addItem.mutate({
                consultation_id: newConsultation.id,
                item_name: feeName,
                quantity: 1,
                price: feePrice,
              });
            }
          },
        },
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [consultLoading, consultation, entry, doctor]);

  useEffect(() => {
    if (consultation) {
      const c = consultation as {
        case_note?: string;
        dispense_note?: string;
        diagnosis_text?: string;
      };
      setCaseNote(c.case_note ?? '');
      setDispenseNote(c.dispense_note ?? '');
      setDiagnosisText(c.diagnosis_text ?? '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [consultationId]);

  useEffect(() => {
    if (vitals) {
      setVitalForm({
        height_cm: vitals.height_cm?.toString() ?? '',
        weight_kg: vitals.weight_kg?.toString() ?? '',
        temperature_c: vitals.temperature_c?.toString() ?? '',
        bp_systolic: vitals.bp_systolic?.toString() ?? '',
        bp_diastolic: vitals.bp_diastolic?.toString() ?? '',
        heart_rate: vitals.heart_rate?.toString() ?? '',
        spo2: vitals.spo2?.toString() ?? '',
        blood_glucose: vitals.blood_glucose?.toString() ?? '',
        respiratory_rate: vitals.respiratory_rate?.toString() ?? '',
      });
    }
  }, [vitals?.id]);

  const handleSaveNotes = async () => {
    if (!consultationId) {
      toast.error('Doctor profile missing or consultation not created — contact admin');
      return;
    }
    await updateConsultation.mutateAsync({
      id: consultationId,
      case_note: caseNote,
      dispense_note: dispenseNote,
      diagnosis_id: null,
      diagnosis_text: diagnosisText,
    });
    toast.success('Consultation notes saved');
  };

  const handleSaveVitals = async () => {
    if (!entry || !patient?.id) {
      toast.error('Missing patient or queue data');
      return;
    }
    const toNum = (v: string) => (v ? Number(v) : null);
    await recordVitals.mutateAsync({
      id: vitals?.id,
      queue_entry_id: entry.id,
      patient_id: patient.id,
      height_cm: toNum(vitalForm.height_cm),
      weight_kg: toNum(vitalForm.weight_kg),
      temperature_c: toNum(vitalForm.temperature_c),
      bp_systolic: toNum(vitalForm.bp_systolic),
      bp_diastolic: toNum(vitalForm.bp_diastolic),
      heart_rate: toNum(vitalForm.heart_rate),
      spo2: toNum(vitalForm.spo2),
      blood_glucose: toNum(vitalForm.blood_glucose),
      respiratory_rate: toNum(vitalForm.respiratory_rate),
    });
    setShowVitalForm(false);
    toast.success('Vital signs recorded');
  };

  const handleBulkInsert = async (
    selectedItems: { id: string; name: string; price: number; type: string }[],
  ) => {
    if (!consultationId) {
      toast.error('Doctor profile missing or consultation not created — contact admin');
      return;
    }
    for (const item of selectedItems) {
      await addItem.mutateAsync({
        consultation_id: consultationId,
        item_name: item.name,
        quantity: 1,
        price: item.price,
      });
    }
    toast.success(`${selectedItems.length} item(s) added to treatment plan`);
  };

  const handleSendToDispensary = async () => {
    if (!entry || !consultationId) {
      toast.error('Doctor profile missing or consultation not created — contact admin');
      return;
    }
    await updateConsultation.mutateAsync({
      id: consultationId,
      case_note: caseNote,
      dispense_note: dispenseNote,
      diagnosis_id: null,
      diagnosis_text: diagnosisText,
      status: 'completed',
    });
    await updateQueue.mutateAsync({
      id: entry.id,
      clinic_status: 'sent_to_dispensary',
    });
    toast.success('Sent to dispensary');
    navigate('/clinic/consultation');
  };

  const handleCallIn = async (roomId: string, roomLabel: string) => {
    if (!entry || !patient || !doctor) return;
    await updateQueue.mutateAsync({
      id: entry.id,
      assigned_room_id: roomId,
      called_by_doctor_id: doctor.id,
      called_at: new Date().toISOString(),
      clinic_status: 'with_doctor',
    });
    toast.success(`${patient.name} called to ${roomLabel}`);
  };

  const serviceNameSet = useMemo(
    () => new Set(services.map((s) => s.name.toLowerCase())),
    [services],
  );
  const packageNameSet = useMemo(
    () => new Set(packages.map((p) => p.name.toLowerCase())),
    [packages],
  );

  const categorizedItems = useMemo(() => {
    return items.map((item) => {
      const nameLower = item.item_name.toLowerCase();
      let category = 'item';
      if (serviceNameSet.has(nameLower)) category = 'service';
      else if (packageNameSet.has(nameLower)) category = 'package';
      return { ...item, category };
    });
  }, [items, serviceNameSet, packageNameSet]);

  const filteredTreatmentItems = useMemo(() => {
    let list = categorizedItems;
    if (treatmentCategory !== 'all') {
      list = list.filter((i) => i.category === treatmentCategory);
    }
    if (treatmentSearch) {
      const q = treatmentSearch.toLowerCase();
      list = list.filter((i) => i.item_name.toLowerCase().includes(q));
    }
    return list;
  }, [categorizedItems, treatmentCategory, treatmentSearch]);

  const itemCounts = useMemo(
    () => ({
      all: categorizedItems.length,
      item: categorizedItems.filter((i) => i.category === 'item').length,
      service: categorizedItems.filter((i) => i.category === 'service').length,
      package: categorizedItems.filter((i) => i.category === 'package').length,
    }),
    [categorizedItems],
  );

  // Suppress unused inventory warning — kept for parity / future categorization
  void inventoryItems;

  if (!entry || !patient) {
    return (
      <div className="space-y-5 max-w-7xl mx-auto">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  return (
    <div className="max-w-[1600px] mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 flex-wrap">
          <Button variant="ghost" size="icon" onClick={() => navigate('/clinic/consultation')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          {doctor && (
            <div className="flex items-center gap-2">
              <Avatar className="h-8 w-8">
                <AvatarImage src={doctor.avatar_url ?? undefined} />
                <AvatarFallback>{doctor.name.charAt(0)}</AvatarFallback>
              </Avatar>
              <span className="font-medium text-sm">{doctor.name}</span>
            </div>
          )}
          <Badge variant="secondary">{waitingCount} waiting</Badge>
          <span className="text-xs text-muted-foreground">
            Waiting: {formatDistanceToNow(new Date(entry.created_at))}
          </span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" className="gap-1">
                <Phone className="h-3 w-3" /> Call In <ChevronDown className="h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {rooms.map((room) => (
                <DropdownMenuItem
                  key={room.id}
                  onClick={() => handleCallIn(room.id, room.label)}
                >
                  {room.label}
                </DropdownMenuItem>
              ))}
              {rooms.length === 0 && (
                <DropdownMenuItem disabled>No rooms configured</DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <StatusBadge status={entry.clinic_status} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* LEFT */}
        <div className="lg:col-span-3 space-y-4">
          <Card>
            <CardContent className="pt-4 space-y-2">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-lg font-semibold">{patient.name}</h2>
                  <p className="text-sm text-muted-foreground">
                    {patient.date_of_birth
                      ? format(new Date(patient.date_of_birth), 'dd MMM yyyy')
                      : '—'}
                  </p>
                  <div className="flex gap-4 text-sm mt-1">
                    <span>IC: {patient.national_id || '—'}</span>
                    <span>Gender: {patient.gender || '—'}</span>
                  </div>
                </div>
                <Badge variant="outline" className="text-lg font-mono">
                  Q{entry.queue_number ?? '—'}
                </Badge>
              </div>
              <div className="flex gap-2 text-sm">
                <span className="text-muted-foreground">Payment:</span>
                <span className="font-medium">{entry.payment_method || 'Self-pay'}</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-sm">Visit Note</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <p className="text-sm whitespace-pre-wrap">
                {entry.visit_notes || 'No visit notes recorded.'}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="py-3 flex flex-row items-center justify-between">
              <CardTitle className="text-sm">Vital Signs</CardTitle>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowVitalForm(!showVitalForm)}
              >
                {showVitalForm ? (
                  <ChevronUp className="h-3 w-3 mr-1" />
                ) : (
                  <ChevronDown className="h-3 w-3 mr-1" />
                )}
                {vitals ? 'Edit' : 'Record now'}
              </Button>
            </CardHeader>
            <CardContent className="pt-0">
              {vitals && !showVitalForm && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                  {[
                    ['Ht', vitals.height_cm, 'cm'],
                    ['Wt', vitals.weight_kg, 'kg'],
                    ['Temp', vitals.temperature_c, '°C'],
                    [
                      'BP',
                      vitals.bp_systolic && vitals.bp_diastolic
                        ? `${vitals.bp_systolic}/${vitals.bp_diastolic}`
                        : null,
                      'mmHg',
                    ],
                    ['HR', vitals.heart_rate, 'bpm'],
                    ['SpO2', vitals.spo2, '%'],
                    ['BG', vitals.blood_glucose, 'mmol/L'],
                    ['RR', vitals.respiratory_rate, '/min'],
                  ].map(([label, val, unit]) => (
                    <div
                      key={label as string}
                      className="text-center p-2 rounded-md bg-muted/50"
                    >
                      <div className="text-xs text-muted-foreground">{label}</div>
                      <div className="font-medium">{val ?? '—'}</div>
                      {val && <div className="text-xs text-muted-foreground">{unit}</div>}
                    </div>
                  ))}
                </div>
              )}
              {showVitalForm && (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {(
                      [
                        'height_cm',
                        'weight_kg',
                        'temperature_c',
                        'bp_systolic',
                        'bp_diastolic',
                        'heart_rate',
                        'spo2',
                        'blood_glucose',
                        'respiratory_rate',
                      ] as const
                    ).map((k) => (
                      <div key={k}>
                        <label className="text-xs text-muted-foreground capitalize">
                          {k.replace(/_/g, ' ')}
                        </label>
                        <Input
                          type="number"
                          value={vitalForm[k]}
                          onChange={(e) =>
                            setVitalForm((f) => ({ ...f, [k]: e.target.value }))
                          }
                          className="h-8"
                        />
                      </div>
                    ))}
                  </div>
                  <Button size="sm" onClick={handleSaveVitals} disabled={recordVitals.isPending}>
                    <Save className="h-3 w-3 mr-1" /> Save Vitals
                  </Button>
                </div>
              )}
              {!vitals && !showVitalForm && (
                <p className="text-sm text-muted-foreground">No vitals recorded yet.</p>
              )}
              {patient.id && <VitalHistoryTrends patientId={patient.id} />}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-sm">Consultation Notes</CardTitle>
            </CardHeader>
            <CardContent className="pt-0 space-y-3">
              <Textarea
                value={caseNote}
                onChange={(e) => setCaseNote(e.target.value)}
                placeholder="Write consultation notes…"
                rows={5}
              />
              <div>
                <label className="text-xs text-muted-foreground font-medium">Diagnosis</label>
                <Input
                  value={diagnosisText}
                  onChange={(e) => setDiagnosisText(e.target.value)}
                  placeholder="Type diagnosis…"
                  className="mt-1"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground font-medium">
                  Dispense Note
                </label>
                <Textarea
                  value={dispenseNote}
                  onChange={(e) => setDispenseNote(e.target.value)}
                  placeholder="Notes for dispensary staff…"
                  rows={2}
                  className="mt-1"
                />
              </div>
              <Button
                size="sm"
                onClick={handleSaveNotes}
                disabled={updateConsultation.isPending}
              >
                <Save className="h-3 w-3 mr-1" /> Save Notes
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-sm">Upcoming Appointments</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              {patientAppointments.length === 0 ? (
                <p className="text-sm text-muted-foreground">No upcoming appointments.</p>
              ) : (
                <div className="space-y-2">
                  {patientAppointments.map((a) => (
                    <div
                      key={a.id}
                      className="flex justify-between items-center text-sm p-2 rounded bg-muted/50"
                    >
                      <span>
                        {format(new Date(a.appointment_date), 'dd MMM yyyy')} at{' '}
                        {a.appointment_time}
                      </span>
                      <span className="text-muted-foreground">{a.doctors?.name ?? '—'}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* RIGHT */}
        <div className="lg:col-span-2 space-y-4">
          <Tabs defaultValue="history">
            <TabsList className="w-full">
              <TabsTrigger value="history" className="flex-1">
                Patient History
              </TabsTrigger>
              <TabsTrigger value="treatment" className="flex-1">
                Treatment Plan
              </TabsTrigger>
            </TabsList>

            <TabsContent value="history" className="space-y-3 mt-3">
              {history.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  No previous visits.
                </p>
              ) : (
                <>
                  {pagedHistory.map((c) => {
                    const consult = c as {
                      id: string;
                      created_at: string;
                      doctors?: { name?: string };
                      diagnoses?: { name?: string };
                      diagnosis_text?: string;
                      case_note?: string;
                      dispense_note?: string;
                      consultation_items?: Array<{
                        id: string;
                        item_name: string;
                        quantity: number;
                        dosage?: string;
                        price: number;
                      }>;
                    };
                    return (
                      <Card key={consult.id}>
                        <CardContent className="pt-4 space-y-2">
                          <div className="flex justify-between text-sm">
                            <span className="font-medium">
                              {format(new Date(consult.created_at), 'dd MMM yyyy')}
                            </span>
                            <span className="text-muted-foreground">
                              {consult.doctors?.name ?? '—'}
                            </span>
                          </div>
                          {consult.diagnoses?.name && (
                            <Badge variant="secondary">{consult.diagnoses.name}</Badge>
                          )}
                          {consult.diagnosis_text && (
                            <Badge variant="secondary">{consult.diagnosis_text}</Badge>
                          )}
                          {consult.case_note && (
                            <p className="text-sm whitespace-pre-wrap">{consult.case_note}</p>
                          )}
                          {consult.dispense_note && (
                            <div>
                              <span className="text-xs text-muted-foreground">
                                Dispense note:
                              </span>
                              <p className="text-sm">{consult.dispense_note}</p>
                            </div>
                          )}
                          {consult.consultation_items &&
                            consult.consultation_items.length > 0 && (
                              <div className="space-y-1">
                                <span className="text-xs text-muted-foreground">Items:</span>
                                {consult.consultation_items.map((it) => (
                                  <div
                                    key={it.id}
                                    className="flex justify-between text-sm pl-2"
                                  >
                                    <span>
                                      {it.item_name} x{it.quantity}{' '}
                                      {it.dosage && `(${it.dosage})`}
                                    </span>
                                    <span>RM {Number(it.price).toFixed(2)}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                        </CardContent>
                      </Card>
                    );
                  })}
                  {history.length > HISTORY_PER_PAGE && (
                    <div className="flex justify-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={historyPage === 0}
                        onClick={() => setHistoryPage((p) => p - 1)}
                      >
                        Previous
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={(historyPage + 1) * HISTORY_PER_PAGE >= history.length}
                        onClick={() => setHistoryPage((p) => p + 1)}
                      >
                        Next
                      </Button>
                    </div>
                  )}
                </>
              )}
            </TabsContent>

            <TabsContent value="treatment" className="mt-3 space-y-3">
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    value={treatmentSearch}
                    onChange={(e) => setTreatmentSearch(e.target.value)}
                    placeholder="Search by name or group name"
                    className="pl-9 h-9"
                  />
                </div>
                <Button size="sm" variant="outline" onClick={() => setBulkDialogOpen(true)}>
                  <Plus className="h-3 w-3 mr-1" /> Add in bulk
                </Button>
              </div>

              <div className="flex gap-1 flex-wrap">
                {[
                  { key: 'all', label: 'All' },
                  { key: 'item', label: 'Items' },
                  { key: 'service', label: 'Services' },
                  { key: 'package', label: 'Packages' },
                ].map((cat) => (
                  <Button
                    key={cat.key}
                    size="sm"
                    variant={treatmentCategory === cat.key ? 'default' : 'outline'}
                    onClick={() => setTreatmentCategory(cat.key)}
                    className="h-7 text-xs"
                  >
                    {cat.label} ({itemCounts[cat.key as keyof typeof itemCounts] ?? 0})
                  </Button>
                ))}
              </div>

              {filteredTreatmentItems.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  No items in treatment plan.
                </p>
              ) : (
                <div className="space-y-3">
                  {filteredTreatmentItems.map((item) => (
                    <TreatmentItemCard
                      key={item.id}
                      item={item as TreatmentItemCardItem}
                      priceTiers={PRICE_TIERS}
                      onRemove={() =>
                        consultationId &&
                        removeItem.mutate({ id: item.id, consultationId })
                      }
                      onSave={async (updates) => {
                        if (!consultationId) return;
                        await updateItem.mutateAsync({
                          id: item.id,
                          consultationId,
                          ...updates,
                        });
                        toast.success('Treatment item updated');
                      }}
                    />
                  ))}
                </div>
              )}

              {categorizedItems.length > 0 && (
                <div className="flex items-center justify-between rounded-lg border bg-muted/50 px-4 py-2">
                  <span className="text-sm font-medium text-muted-foreground">
                    Total · {categorizedItems.length} item
                    {categorizedItems.length !== 1 ? 's' : ''}
                  </span>
                  <span className="text-sm font-semibold">
                    RM{' '}
                    {categorizedItems
                      .reduce((sum, i) => sum + Number(i.price) * i.quantity, 0)
                      .toFixed(2)}
                  </span>
                </div>
              )}
            </TabsContent>
          </Tabs>

          <Separator />
          <div className="flex justify-between items-center gap-2 flex-wrap">
            <div className="text-sm font-medium">
              Total: RM{' '}
              {items.reduce((sum, i) => sum + Number(i.price) * i.quantity, 0).toFixed(2)}
            </div>
            <Button onClick={handleSendToDispensary} disabled={updateQueue.isPending}>
              Send to Dispensary
            </Button>
          </div>
        </div>
      </div>

      <AddTreatmentBulkDialog
        open={bulkDialogOpen}
        onOpenChange={setBulkDialogOpen}
        onInsert={handleBulkInsert}
      />
    </div>
  );
}
