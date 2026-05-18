import { useState, useEffect, useMemo, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Save,
  ChevronDown,
  ChevronUp,
  Search,
  Plus,
  Phone,
  PauseCircle,
  CheckCircle2,
  Stethoscope,
  Copy,
  Check,
  Pencil,
  Trash2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { format, formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { toMalayTitleCase } from '@/lib/textCase';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { StatusBadge } from '@/components/clinic/StatusBadge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { FollowUpScheduler } from '@/components/clinic/patient/FollowUpScheduler';
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
import { useConsultationLock } from '@/hooks/clinic/useConsultationLock';
import { ConsultationLockBanner } from '@/components/clinic/consultation/ConsultationLockBanner';
import { useClinicPreferences } from '@/hooks/clinic/useClinicPreferences';
import { useVitalSigns, useRecordVitalSigns } from '@/hooks/clinic/useVitalSigns';
import {
  useConsultationItems,
  useAddConsultationItem,
  useRemoveConsultationItem,
  useUpdateConsultationItem,
} from '@/hooks/clinic/useConsultationItems';
import { useClinicAppointments } from '@/hooks/clinic/useClinicAppointments';
import { useInventoryItemsSafe } from '@/hooks/clinic/useInventoryItems';
import { useServicesSafe } from '@/hooks/clinic/useServices';
import { usePackagesSafe } from '@/hooks/clinic/usePackages';
import { useRooms } from '@/hooks/clinic/useRooms';
import { AddTreatmentBulkDialog } from '@/components/clinic/consultation/AddTreatmentBulkDialog';
import { IssueDocumentModal } from '@/components/clinic/consultation/IssueDocumentModal';
import {
  useConsultationDocuments,
  useDeleteConsultationDocument,
  type DocumentTemplate,
  type ConsultationDocument,
} from '@/hooks/clinic/useClinicDocuments';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { ViewDocumentModal } from '@/components/clinic/consultation/ViewDocumentModal';
import { printDocument } from '@/lib/clinic/printDocument';
import { VitalHistoryTrends } from '@/components/clinic/consultation/VitalHistoryTrends';
import {
  TreatmentItemCard,
  type TreatmentItemCardItem,
} from '@/components/clinic/consultation/TreatmentItemCard';
import { DiagnosisCombobox } from '@/components/clinic/consultation/DiagnosisCombobox';
import { useDiagnoses } from '@/hooks/clinic/useDiagnoses';
import { SessionAttachmentsStrip } from '@/components/clinic/consultation/SessionAttachmentsStrip';
import { useAuth } from '@/contexts/AuthContext';
import { formatQueueNo } from '@/lib/clinic/queueNumber';

const PRICE_TIERS = ['SELF PAY', 'PANEL'];

interface PastVisit {
  id: string;
  created_at: string;
  doctors?: { name?: string } | null;
  diagnoses?: { id?: string; name?: string } | null;
  diagnosis_text?: string | null;
  case_note?: string | null;
  dispense_note?: string | null;
  consultation_items?: Array<{
    id: string;
    item_name: string;
    quantity: number;
    dosage?: string | null;
    price: number;
  }> | null;
}

interface CopyDiagnosisPayload {
  diagnosis_id: string | null;
  name: string;
}

/**
 * Single entry in the doctor-side Past Visits timeline. Owns its own
 * expand/collapse state so opening one card doesn't affect siblings.
 * Notes longer than ~120 chars truncate to two lines until expanded.
 */
function PastVisitCard({
  visit,
  onCopyDiagnosis,
}: {
  visit: PastVisit;
  onCopyDiagnosis?: (payload: CopyDiagnosisPayload) => void;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const structuredName = visit.diagnoses?.name?.trim() || '';
  const freeText = visit.diagnosis_text?.trim() || '';
  const diagnosisDisplay = structuredName || freeText;
  const diagnosisId = visit.diagnoses?.id ?? null;
  const note = (visit.case_note ?? '').trim();
  const isLongNote = note.length > 120;
  const dispenseNote = (visit.dispense_note ?? '').trim();

  const handleCopy = () => {
    if (!diagnosisDisplay || !onCopyDiagnosis) return;
    onCopyDiagnosis({
      diagnosis_id: structuredName ? diagnosisId : null,
      name: diagnosisDisplay,
    });
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative pl-6 py-3 border-l-2 border-slate-100 first:pt-0 last:pb-0">
      {/* Timeline dot */}
      <span
        aria-hidden="true"
        className="absolute -left-[5px] top-4 h-2 w-2 rounded-full bg-blue-400 ring-2 ring-white"
      />

      {/* Date + doctor */}
      <div className="text-sm">
        <span className="font-semibold text-slate-800">
          {format(new Date(visit.created_at), 'dd MMM yyyy')}
        </span>
        {visit.doctors?.name && (
          <span className="text-slate-500"> — Dr. {visit.doctors.name}</span>
        )}
      </div>

      {/* Diagnosis */}
      {diagnosisDisplay && (
        <div className="mt-1 flex items-start gap-1.5 group/diag">
          <Stethoscope className="h-3.5 w-3.5 text-blue-600 mt-[2px] shrink-0" />
          <Badge className="rounded-full bg-blue-50 text-blue-700 border-none font-medium">
            {diagnosisDisplay}
          </Badge>
          {onCopyDiagnosis && (
            <button
              type="button"
              onClick={handleCopy}
              title="Copy diagnosis to today's visit"
              aria-label="Copy diagnosis to today's visit"
              className="opacity-100 sm:opacity-0 sm:group-hover/diag:opacity-100 focus-visible:opacity-100 transition-opacity p-1 rounded text-blue-600 hover:bg-blue-100"
            >
              {copied ? (
                <Check className="h-3 w-3" />
              ) : (
                <Copy className="h-3 w-3" />
              )}
            </button>
          )}
        </div>
      )}

      {/* Collapsible clinical note */}
      {note && (
        <div className="mt-2">
          <p
            onClick={() => isLongNote && setIsExpanded((v) => !v)}
            className={cn(
              'text-xs leading-relaxed transition-colors',
              isLongNote && 'cursor-pointer hover:text-slate-700',
              isExpanded
                ? 'text-slate-800 whitespace-pre-wrap'
                : 'text-slate-500 line-clamp-2',
            )}
          >
            {note}
          </p>
          {isLongNote && (
            <button
              type="button"
              onClick={() => setIsExpanded((v) => !v)}
              className="mt-1 inline-flex items-center gap-0.5 text-[10px] font-semibold text-blue-600 hover:text-blue-800 hover:underline"
            >
              {isExpanded ? (
                <>
                  Show less <ChevronUp className="h-3 w-3" />
                </>
              ) : (
                <>
                  Read full notes <ChevronDown className="h-3 w-3" />
                </>
              )}
            </button>
          )}
        </div>
      )}

      {/* Dispense note */}
      {dispenseNote && (
        <div className="mt-2">
          <span className="text-xs text-slate-400">Dispense note:</span>
          <p className="text-sm text-slate-700 whitespace-pre-wrap">{dispenseNote}</p>
        </div>
      )}

      {/* Items */}
      {visit.consultation_items && visit.consultation_items.length > 0 && (
        <div className="space-y-0.5 pt-2">
          <span className="text-xs text-slate-400">Items:</span>
          {visit.consultation_items.map((it) => (
            <div
              key={it.id}
              className="flex justify-between items-start gap-4 w-full pl-2"
            >
              <div className="flex-1 min-w-0 flex flex-col">
                <span className="text-sm text-slate-600 break-words">
                  {it.item_name} x{it.quantity}{' '}
                  {it.dosage && `(${it.dosage})`}
                </span>
              </div>
              <span className="shrink-0 text-right whitespace-nowrap text-sm text-slate-600">
                RM {Number(it.price).toFixed(2)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ConsultationDetail() {
  const { queueEntryId } = useParams<{ queueEntryId: string }>();
  const navigate = useNavigate();
  const { isLocum } = useAuth();
  const { data: doctor } = useCurrentDoctor();
  const { data: entries = [] } = useConsultationQueueEntries();
  const updateQueue = useUpdateQueueEntry();
  const { data: rooms = [] } = useRooms();
  const { getPreference, isLoading: preferencesLoading } = useClinicPreferences();

  // Synchronous locks to prevent React 18 Strict-Mode double-mount and
  // re-render races during the consultation-creation network window from
  // double-billing the patient.
  const hasCreatedConsultRef = useRef(false);
  const hasSeededFeeRef = useRef(false);

  const entry = useMemo(
    () => entries.find((e) => e.id === queueEntryId),
    [entries, queueEntryId],
  );
  const patient = entry?.patients;
  const isPanel =
    !!(entry as { panel_id?: string | null } | undefined)?.panel_id ||
    (entry?.payment_method ?? '').startsWith('panel');

  const { data: consultation, isLoading: consultLoading } = useConsultation(queueEntryId);
  const createConsultation = useCreateConsultation();
  const updateConsultation = useUpdateConsultation();

  const isLocked =
    consultation?.status === 'completed' ||
    entry?.clinic_status === 'completed';

  // Tracks which treatment-item cards have unflushed auto-saves in flight.
  const pendingSavesRef = useRef<Set<string>>(new Set());
  const [pendingSaveCount, setPendingSaveCount] = useState(0);
  const handleItemSavingChange = (itemId: string, isSaving: boolean) => {
    if (isSaving) pendingSavesRef.current.add(itemId);
    else pendingSavesRef.current.delete(itemId);
    setPendingSaveCount(pendingSavesRef.current.size);
  };
  const waitForPendingSaves = async (timeoutMs = 5000) => {
    if (pendingSavesRef.current.size === 0) return;
    const start = Date.now();
    while (pendingSavesRef.current.size > 0 && Date.now() - start < timeoutMs) {
      await new Promise((r) => setTimeout(r, 100));
    }
  };

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
  const [diagnosisId, setDiagnosisId] = useState<string | null>(null);

  const consultationId = (consultation as { id?: string } | null)?.id;
  const { isLockedByOther, canEdit, forceUnlock } = useConsultationLock(
    consultation as
      | { id?: string; locked_by?: string | null; status?: string }
      | null
      | undefined,
  );
  const { data: items = [] } = useConsultationItems(consultationId);
  const { data: attachedDocs = [] } = useConsultationDocuments(consultationId);
  const [issuingTemplate, setIssuingTemplate] = useState<DocumentTemplate | null>(null);
  const [editingDoc, setEditingDoc] = useState<ConsultationDocument | null>(null);
  const [voidingDoc, setVoidingDoc] = useState<ConsultationDocument | null>(null);
  const [viewingDoc, setViewingDoc] = useState<ConsultationDocument | null>(null);
  const deleteDoc = useDeleteConsultationDocument();
  const addItem = useAddConsultationItem();
  const removeItem = useRemoveConsultationItem();
  const updateItem = useUpdateConsultationItem();

  // Use the cost-free safe view so locum doctors (blocked from the base
  // inventory_items table) can still populate the picker. Cost data is not
  // needed here — pricing is resolved server-side by trg_resolve_selling_price.
  const { data: inventoryItems = [] } = useInventoryItemsSafe();
  const { data: services = [] } = useServicesSafe();
  const { data: packages = [] } = usePackagesSafe();

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

  const { diagnoses: diagnosisCatalog = [] } = useDiagnoses();

  /**
   * Append-not-overwrite copy of a past diagnosis into today's form state.
   * - Empty field → set structured id (if known) or free text.
   * - Already structured → demote to text and append `, <new>`.
   * - Already free text → append `, <new>`.
   * Case-insensitive duplicate guard prevents repeated chips.
   */
  const handleCopyDiagnosis = ({ diagnosis_id, name }: CopyDiagnosisPayload) => {
    const trimmed = name.trim();
    if (!trimmed) return;

    const currentText = diagnosisText.trim();
    const currentStructuredName = diagnosisId
      ? diagnosisCatalog.find((d) => d.id === diagnosisId)?.name?.trim() ?? ''
      : '';
    const currentDisplay = currentStructuredName || currentText;

    // Duplicate guard
    const tokens = currentDisplay
      .split(',')
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean);
    if (tokens.includes(trimmed.toLowerCase())) return;

    if (!currentDisplay) {
      if (diagnosis_id) {
        setDiagnosisId(diagnosis_id);
        setDiagnosisText('');
      } else {
        setDiagnosisId(null);
        setDiagnosisText(trimmed);
      }
      return;
    }

    // Demote any structured selection so we can hold multiple labels as text.
    setDiagnosisId(null);
    setDiagnosisText(`${currentDisplay}, ${trimmed}`);
  };

  const waitingCount = useMemo(() => {
    if (!doctor) return 0;
    return entries.filter(
      (e) =>
        e.assigned_doctor_id === doctor.id &&
        ['registered', 'ready_for_doctor'].includes(e.clinic_status),
    ).length;
  }, [entries, doctor]);

  // Auto-create consultation + seed default consultation fee.
  // Race-safe: synchronous refs lock BEFORE firing the mutation so a
  // Strict-Mode double-mount or re-render during the ~200ms DB roundtrip
  // cannot create a second consultation or double-seed the fee.
  useEffect(() => {
    if (preferencesLoading) return;
    if (consultLoading) return;
    if (!entry || !doctor) return;
    if (consultation) return;
    if (hasCreatedConsultRef.current) return;

    hasCreatedConsultRef.current = true; // lock BEFORE firing

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
          if (feeName && feePrice > 0 && !hasSeededFeeRef.current) {
            hasSeededFeeRef.current = true; // lock BEFORE seeding
            addItem.mutate({
              consultation_id: newConsultation.id,
              item_name: feeName,
              quantity: 1,
              price: feePrice,
            });
          }
        },
        onError: () => {
          // Allow a retry on a real network/DB failure.
          hasCreatedConsultRef.current = false;
        },
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preferencesLoading, consultLoading, consultation, entry, doctor]);

  useEffect(() => {
    if (consultation) {
      const c = consultation as {
        case_note?: string;
        dispense_note?: string;
        diagnosis_text?: string;
        diagnosis_id?: string | null;
      };
      setCaseNote(c.case_note ?? '');
      setDispenseNote(c.dispense_note ?? '');
      setDiagnosisText(c.diagnosis_text ?? '');
      setDiagnosisId(c.diagnosis_id ?? null);
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
      diagnosis_id: diagnosisId,
      diagnosis_text: diagnosisText,
    });
    toast.success('Consultation notes saved');
  };

  const handleUpdateClinicalNotes = async () => {
    if (!consultationId) {
      toast.error('Consultation not found');
      return;
    }
    await updateConsultation.mutateAsync({
      id: consultationId,
      case_note: caseNote,
      diagnosis_id: diagnosisId,
      diagnosis_text: diagnosisText,
    });
    toast.success('Clinical notes updated');
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
    selectedItems: {
      id: string;
      name: string;
      price: number;
      type: string;
      defaults?: {
        indication?: string | null;
        dosage_qty?: string | null;
        dosage_unit?: string | null;
        frequency?: string | null;
        instruction?: string | null;
        duration?: string | null;
        duration_unit?: string | null;
        precaution?: string | null;
      };
    }[],
  ) => {
    if (!consultationId) {
      toast.error('Doctor profile missing or consultation not created — contact admin');
      return;
    }
    for (const item of selectedItems) {
      const d = item.defaults ?? {};
      // Combine duration + unit (e.g. "5" + "days" → "5 days") to fit the
      // single `duration` text column on consultation_items.
      const combinedDuration =
        d.duration && d.duration_unit
          ? `${d.duration} ${d.duration_unit}`.trim()
          : (d.duration ?? null);
      const dosageQtyNum =
        d.dosage_qty && !Number.isNaN(Number(d.dosage_qty))
          ? Number(d.dosage_qty)
          : null;

      await addItem.mutateAsync({
        consultation_id: consultationId,
        item_name: item.name,
        quantity: 1,
        price: item.price,
        ...(item.type === 'item'
          ? {
              item_id: item.id,
              indication: d.indication ?? null,
              dosage_qty: dosageQtyNum,
              dosage_unit: d.dosage_unit ?? null,
              frequency: d.frequency ?? null,
              instruction: d.instruction ?? null,
              duration: combinedDuration,
              precaution: d.precaution ?? null,
            }
          : {}),
      });
    }
    toast.success(`${selectedItems.length} item(s) added to treatment plan`);
  };

  const handleSendToDispensary = async () => {
    if (isLocked) {
      toast.error('This consultation is completed and cannot be modified');
      return;
    }
    if (!entry || !consultationId) {
      toast.error('Doctor profile missing or consultation not created — contact admin');
      return;
    }
    if (pendingSavesRef.current.size > 0) {
      toast.message('Saving your edits…');
      await waitForPendingSaves();
    }
    await updateConsultation.mutateAsync({
      id: consultationId,
      case_note: caseNote,
      dispense_note: dispenseNote,
      diagnosis_id: diagnosisId,
      diagnosis_text: diagnosisText,
    });
    await updateQueue.mutateAsync({
      id: entry.id,
      clinic_status: 'sent_to_dispensary',
    });
    toast.success('Sent to dispensary');
    navigate(isLocum ? '/clinic/queue' : '/clinic/consultation', { replace: true });
  };

  const handlePutOnHold = async () => {
    if (isLocked) {
      toast.error('This consultation is completed and cannot be modified');
      return;
    }
    if (!entry) return;

    try {
      if (pendingSavesRef.current.size > 0) {
        toast.message('Saving your edits…');
        await waitForPendingSaves();
      }
      if (consultationId) {
        await updateConsultation.mutateAsync({
          id: consultationId,
          case_note: caseNote,
          dispense_note: dispenseNote,
          diagnosis_id: diagnosisId,
          diagnosis_text: diagnosisText,
        });
      }

      await updateQueue.mutateAsync({
        id: entry.id,
        clinic_status: 'on_hold',
      });

      toast.success(`${patient?.name ?? 'Patient'} placed on hold`);
      navigate(isLocum ? '/clinic/queue' : '/clinic/consultation', { replace: true });
    } catch (error: any) {
      toast.error(`Failed to place on hold: ${error.message || 'Unknown error'}`);
    }
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
    toast.success(`${toMalayTitleCase(patient.name)} called to ${roomLabel}`);
  };

  const serviceNameSet = useMemo(
    () => new Set(services.map((s) => s.name.toLowerCase())),
    [services],
  );
  const packageNameSet = useMemo(
    () => new Set(packages.map((p) => p.name.toLowerCase())),
    [packages],
  );

  /**
   * Tag each consultation_items row with a UI-side category, mirroring the
   * picker mapping:
   *   - 'service'  → name matches a service in the catalog
   *   - 'package'  → name matches a package in the catalog
   *   - 'item'     → everything else (defaults to medicine)
   */
  const PROCEDURE_RE = /\b(fee|procedure|service)\b/i;
  const categorizedItems = useMemo(() => {
    return items.map((item) => {
      const nameLower = item.item_name.toLowerCase();
      let category = 'item';
      if (serviceNameSet.has(nameLower)) category = 'service';
      else if (packageNameSet.has(nameLower)) category = 'package';
      return { ...item, category };
    });
  }, [items, serviceNameSet, packageNameSet]);

  /**
   * Map a categorized row to one of the new UI tabs.
   * Procedure ⇢ services + item-typed rows whose name reads like a fee/procedure.
   */
  const matchesTreatmentTab = (
    row: { category: string; item_name: string },
    tab: string,
  ): boolean => {
    if (tab === 'all') return true;
    if (tab === 'medicine')
      return row.category === 'item' && !PROCEDURE_RE.test(row.item_name);
    if (tab === 'procedure')
      return (
        row.category === 'service' ||
        (row.category === 'item' && PROCEDURE_RE.test(row.item_name))
      );
    if (tab === 'package') return row.category === 'package';
    return true;
  };

  const filteredTreatmentItems = useMemo(() => {
    let list = categorizedItems.filter((i) => matchesTreatmentTab(i, treatmentCategory));
    if (treatmentSearch) {
      const q = treatmentSearch.toLowerCase();
      list = list.filter((i) => String(i.item_name ?? '').toLowerCase().includes(q));
    }
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categorizedItems, treatmentCategory, treatmentSearch]);

  const itemCounts = useMemo(
    () => ({
      all: categorizedItems.length,
      medicine: categorizedItems.filter((i) => matchesTreatmentTab(i, 'medicine')).length,
      procedure: categorizedItems.filter((i) => matchesTreatmentTab(i, 'procedure')).length,
      package: categorizedItems.filter((i) => matchesTreatmentTab(i, 'package')).length,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const bento =
    'bg-white border-none rounded-2xl shadow-[0_4px_20px_rgb(0,0,0,0.03)]';
  const bentoHeader =
    'text-sm font-bold text-slate-800 uppercase tracking-wider mb-3';
  const softInput =
    'bg-slate-50 border-transparent focus-visible:bg-white focus-visible:border-blue-500 rounded-lg';

  const total = items.reduce((sum, i) => sum + Number(i.price) * i.quantity, 0);

  return (
    <div className="min-h-full bg-slate-50 -m-4 md:-m-6 p-4 md:p-6">
      <div className="max-w-[1600px] mx-auto space-y-4">
        {/* Header bar */}
        <div className={`${bento} p-4 flex items-center justify-between gap-3 flex-wrap`}>
          <div className="flex items-center gap-3 flex-wrap">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate(isLocum ? '/clinic/queue' : '/clinic/consultation')}
              className="rounded-lg"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            {doctor && (
              <div className="flex items-center gap-2">
                <Avatar className="h-8 w-8">
                  <AvatarImage src={doctor.avatar_url ?? undefined} />
                  <AvatarFallback>{doctor.name.charAt(0)}</AvatarFallback>
                </Avatar>
                <span className="font-medium text-sm text-slate-800">{doctor.name}</span>
              </div>
            )}
            <Badge className="rounded-full bg-slate-50 text-slate-600 border-none hover:bg-slate-100">
              {waitingCount} waiting
            </Badge>
            <span className="text-xs text-slate-500">
              Waiting: {formatDistanceToNow(new Date(entry.created_at))}
            </span>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  size="sm"
                  className="gap-1 rounded-xl bg-blue-600 hover:bg-blue-700 text-white"
                >
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

        {/* Split-pane: workspace first in DOM (mobile), context second; visual order flipped on lg */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* MAIN — Workspace (right on desktop, first on mobile) */}
          <main className="order-1 lg:order-2 lg:col-span-8 space-y-4 flex flex-col pb-24 relative">
            {isLocked && (
              <Alert className="border-emerald-200 bg-emerald-50 text-emerald-900">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                <AlertDescription>
                  This consultation is completed. Changes are limited to clinical documentation only.
                </AlertDescription>
              </Alert>
            )}
            {isLockedByOther && (
              <ConsultationLockBanner onForceUnlock={forceUnlock} />
            )}
            {/* Consultation Notes — document canvas */}
            <Card className={bento}>
              <CardContent className="p-5 space-y-4">
                <h2 className={bentoHeader}>CONSULTATION NOTES</h2>
                <Textarea
                  value={caseNote}
                  onChange={(e) => setCaseNote(e.target.value)}
                  placeholder="Write consultation notes…"
                  className="min-h-[400px] resize-y bg-slate-50 border-transparent focus-visible:bg-white focus-visible:border-blue-500 focus-visible:ring-2 focus-visible:ring-blue-200 rounded-xl p-4 text-base leading-relaxed text-slate-800"
                />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                      Diagnosis
                    </Label>
                    <DiagnosisCombobox
                      diagnosisId={diagnosisId}
                      diagnosisText={diagnosisText}
                      onChange={({ diagnosis_id, diagnosis_text }) => {
                        setDiagnosisId(diagnosis_id);
                        setDiagnosisText(diagnosis_text);
                      }}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                      Dispense Note
                    </Label>
                    <Textarea
                      value={dispenseNote}
                      onChange={(e) => setDispenseNote(e.target.value)}
                      placeholder="Notes for dispensary staff…"
                      rows={3}
                      className={softInput}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                      Session Attachments
                    </Label>
                    <SessionAttachmentsStrip
                      consultationId={consultationId}
                      canEdit={canEdit}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Treatment Plan */}
            <Card className={bento}>
              <CardContent className="p-5 space-y-4">
                <div className="flex items-center gap-3 flex-wrap">
                  <h2 className={`${bentoHeader} mb-0 mr-auto`}>TREATMENT PLAN</h2>
                  <div className="relative flex-1 min-w-[200px]">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <Input
                      value={treatmentSearch}
                      onChange={(e) => setTreatmentSearch(e.target.value)}
                      placeholder="Search by name or group name"
                      className={`${softInput} pl-9 h-9`}
                    />
                  </div>
                  <Button
                    size="sm"
                    onClick={() => setBulkDialogOpen(true)}
                    disabled={!canEdit}
                    className="rounded-lg bg-blue-600 hover:bg-blue-700 text-white"
                  >
                    <Plus className="h-3 w-3 mr-1" /> Add in bulk
                  </Button>
                </div>

                <div className="flex gap-2 flex-wrap">
                  {[
                    { key: 'all', label: 'All' },
                    { key: 'medicine', label: 'Medicine' },
                    { key: 'procedure', label: 'Procedures' },
                    { key: 'package', label: 'Packages' },
                  ].map((cat) => {
                    const active = treatmentCategory === cat.key;
                    return (
                      <button
                        key={cat.key}
                        type="button"
                        onClick={() => setTreatmentCategory(cat.key)}
                        className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                          active
                            ? 'bg-blue-600 text-white'
                            : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
                        }`}
                      >
                        {cat.label} ({itemCounts[cat.key as keyof typeof itemCounts] ?? 0})
                      </button>
                    );
                  })}
                </div>

                {filteredTreatmentItems.length === 0 ? (
                  <p className="text-sm text-slate-400 text-center py-8">
                    No items in treatment plan.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {filteredTreatmentItems.map((item) => (
                      <TreatmentItemCard
                        key={item.id}
                        item={item as TreatmentItemCardItem}
                        priceTiers={PRICE_TIERS}
                        isPanel={isPanel}
                        disabled={!canEdit}
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
                  <div className="rounded-xl bg-slate-50 px-4 py-3 flex items-center justify-between text-sm">
                    <span className="font-medium text-slate-500">
                      Total · {categorizedItems.length} item
                      {categorizedItems.length !== 1 ? 's' : ''}
                    </span>
                    <span className="font-semibold text-slate-800">
                      RM {total.toFixed(2)}
                    </span>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Attached Documents */}
            <Card className={bento}>
              <CardContent className="p-5 space-y-3">
                <h2 className={`${bentoHeader} mb-0`}>ATTACHED DOCUMENTS</h2>
                {attachedDocs.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No documents attached. Use the "Documents" tab in Add in bulk to issue one.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {attachedDocs.map((doc) => (
                      <div
                        key={doc.id}
                        className="flex items-center justify-between gap-3 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2"
                      >
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-slate-800 truncate">
                            {doc.template_name}
                          </div>
                          <div className="text-[11px] text-muted-foreground">
                            {doc.type ?? 'document'} ·{' '}
                            {new Date(doc.created_at).toLocaleString('en-MY')} · {doc.paper_size}{' '}
                            {doc.orientation}
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setViewingDoc(doc)}
                          >
                            View / Print
                          </Button>
                          {!isLocked && (
                            <>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-8 w-8"
                                onClick={() => setEditingDoc(doc)}
                                aria-label="Edit document"
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                                onClick={() => setVoidingDoc(doc)}
                                aria-label="Void document"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <div className="sticky bottom-4 z-10 bg-white/90 backdrop-blur-md border border-slate-100 rounded-2xl shadow-lg p-4 flex items-center justify-between gap-3 flex-wrap">
              <div className="text-sm">
                <span className="text-slate-500">Total</span>{' '}
                <span className="text-xl font-bold text-slate-800">
                  RM {total.toFixed(2)}
                </span>
              </div>
              <div className="flex flex-wrap gap-2 justify-end">
                <Button
                  variant="outline"
                  onClick={isLocked ? handleUpdateClinicalNotes : handleSaveNotes}
                  disabled={updateConsultation.isPending}
                  className="rounded-xl"
                >
                  <Save className="h-4 w-4 mr-1" />
                  {isLocked ? 'Update Clinical Notes' : 'Save Draft'}
                </Button>
                {!isLocked && (
                  <>
                    <Button
                      variant="outline"
                      onClick={handlePutOnHold}
                      disabled={
                        updateQueue.isPending ||
                        updateConsultation.isPending ||
                        entry.clinic_status === 'on_hold'
                      }
                      className="rounded-xl border-amber-300 text-amber-700 hover:bg-amber-50 hover:text-amber-800"
                    >
                      <PauseCircle className="h-4 w-4 mr-1" /> Put on Hold
                    </Button>
                    <Button
                      onClick={handleSendToDispensary}
                      disabled={updateQueue.isPending}
                      className="px-8 py-6 rounded-xl text-base font-semibold bg-blue-600 hover:bg-blue-700 text-white shadow-md"
                    >
                      Send to Dispensary
                    </Button>
                  </>
                )}
              </div>
            </div>
          </main>

          {/* ASIDE — Context (left on desktop, second on mobile) */}
          <aside className="order-2 lg:order-1 lg:col-span-4 space-y-4">
            {/* Visit Note — visit purpose + visit note from registration counter */}
            <Card className="rounded-2xl border-amber-200 bg-amber-50/60 shadow-sm">
              <CardContent className="p-5 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="inline-flex h-2 w-2 rounded-full bg-amber-500" />
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-amber-800">
                    Visit Note
                  </h3>
                </div>
                {entry.visit_purpose && (
                  <div className="inline-flex items-center rounded-full bg-amber-100 text-amber-800 text-xs font-medium px-2.5 py-0.5 capitalize">
                    {entry.visit_purpose.replace(/_/g, ' ')}
                  </div>
                )}
                <p className="text-base leading-relaxed whitespace-pre-wrap text-slate-800 font-medium">
                  {entry.visit_notes || (
                    <span className="text-slate-400 font-normal italic">
                      No visit notes recorded by registration counter.
                    </span>
                  )}
                </p>
              </CardContent>
            </Card>

            {/* Demographics */}
            <Card className={bento}>
              <CardContent className="p-5 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2.5 min-w-0">
                    <div className="bg-blue-50 text-blue-600 rounded-lg p-1.5 shrink-0 mt-0.5">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
                        <circle cx="12" cy="7" r="4" />
                      </svg>
                    </div>
                    <div className="min-w-0">
                      <h2 className="text-base font-semibold text-slate-800 truncate">
                        {toMalayTitleCase(patient.name)}
                      </h2>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {patient.date_of_birth
                          ? format(new Date(patient.date_of_birth), 'dd MMM yyyy')
                          : '—'}
                      </p>
                    </div>
                  </div>
                  <span className="rounded-xl bg-blue-50 text-blue-700 font-mono text-base px-2.5 py-1 shrink-0">
                    {formatQueueNo(entry.created_at, entry.queue_sequence)}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm text-slate-600">
                  <div>
                    <span className="text-xs text-slate-400 block">IC</span>
                    {patient.national_id || '—'}
                  </div>
                  <div>
                    <span className="text-xs text-slate-400 block">Gender</span>
                    {patient.gender || '—'}
                  </div>
                </div>
                <div>
                  <span className="inline-flex items-center rounded-full bg-slate-50 text-slate-600 text-xs px-2 py-0.5">
                    {entry.payment_method || 'Self-pay'}
                  </span>
                </div>
              </CardContent>
            </Card>

            {/* Vital Signs */}
            <Card className={bento}>
              <CardContent className="p-5">
                <div className="flex items-center justify-between mb-3">
                  <h3 className={`${bentoHeader} mb-0`}>VITAL SIGNS</h3>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setShowVitalForm(!showVitalForm)}
                    className="rounded-lg"
                  >
                    {showVitalForm ? (
                      <ChevronUp className="h-3 w-3 mr-1" />
                    ) : (
                      <ChevronDown className="h-3 w-3 mr-1" />
                    )}
                    {vitals ? 'Edit' : 'Record now'}
                  </Button>
                </div>
                {vitals && !showVitalForm && (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
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
                        className="bg-slate-50 rounded-xl p-3 text-center"
                      >
                        <div className="text-xl font-bold text-slate-800">{val ?? '—'}</div>
                        <div className="text-xs text-slate-500 mt-0.5">
                          {label as string}
                          {val ? ` (${unit as string})` : ''}
                        </div>
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
                          <label className="text-xs text-slate-500 capitalize">
                            {k.replace(/_/g, ' ')}
                          </label>
                          <Input
                            type="number"
                            value={vitalForm[k]}
                            onChange={(e) =>
                              setVitalForm((f) => ({ ...f, [k]: e.target.value }))
                            }
                            className={`${softInput} h-8`}
                          />
                        </div>
                      ))}
                    </div>
                    <Button
                      size="sm"
                      onClick={handleSaveVitals}
                      disabled={recordVitals.isPending}
                      className="rounded-lg bg-blue-600 hover:bg-blue-700 text-white"
                    >
                      <Save className="h-3 w-3 mr-1" /> Save Vitals
                    </Button>
                  </div>
                )}
                {!vitals && !showVitalForm && (
                  <p className="text-sm text-slate-400">No vitals recorded yet.</p>
                )}
                {patient.id && <VitalHistoryTrends patientId={patient.id} currentQueueId={queueEntryId} />}
              </CardContent>
            </Card>

            {/* Past Visits */}
            <Card className={bento}>
              <CardContent className="p-5">
                <h3 className={bentoHeader}>PAST VISITS</h3>
                {history.length === 0 ? (
                  <p className="text-sm text-slate-400 text-center py-4">
                    No previous visits.
                  </p>
                ) : (
                  <>
                    <div className="space-y-1">
                      {pagedHistory.map((c) => (
                        <PastVisitCard
                          key={(c as { id: string }).id}
                          visit={c as PastVisit}
                          onCopyDiagnosis={canEdit ? handleCopyDiagnosis : undefined}
                        />
                      ))}
                    </div>
                    {history.length > HISTORY_PER_PAGE && (
                      <div className="flex justify-center gap-2 pt-3">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={historyPage === 0}
                          onClick={() => setHistoryPage((p) => p - 1)}
                          className="rounded-lg"
                        >
                          Previous
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={(historyPage + 1) * HISTORY_PER_PAGE >= history.length}
                          onClick={() => setHistoryPage((p) => p + 1)}
                          className="rounded-lg"
                        >
                          Next
                        </Button>
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>

            {/* Upcoming Appointments */}
            <Card className={bento}>
              <CardContent className="p-5">
                <h3 className={bentoHeader}>UPCOMING</h3>
                {patientAppointments.length === 0 ? (
                  <p className="text-sm text-slate-400">No upcoming appointments.</p>
                ) : (
                  <div className="space-y-2">
                    {patientAppointments.map((a) => (
                      <div
                        key={a.id}
                        className="flex justify-between items-center text-sm rounded-lg bg-slate-50 px-3 py-2"
                      >
                        <span className="text-slate-700">
                          {format(new Date(a.appointment_date), 'dd MMM yyyy')} at{' '}
                          {a.appointment_time}
                        </span>
                        <span className="text-slate-500">{a.doctors?.name ?? '—'}</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {entry?.patient_id && (
              <FollowUpScheduler
                patientId={entry.patient_id}
                defaultDoctorId={consultation?.doctor_id ?? null}
              />
            )}
          </aside>
        </div>

        <AddTreatmentBulkDialog
          open={bulkDialogOpen}
          onOpenChange={setBulkDialogOpen}
          onInsert={handleBulkInsert}
          isPanel={(entry?.payment_method ?? '').startsWith('panel')}
          onIssueDocument={(tpl) => setIssuingTemplate(tpl)}
        />

        <IssueDocumentModal
          isOpen={!!issuingTemplate || !!editingDoc}
          onClose={() => {
            setIssuingTemplate(null);
            setEditingDoc(null);
          }}
          template={issuingTemplate}
          existingDoc={editingDoc}
          patient={patient?.id ? (patient as { id: string; name?: string | null; national_id?: string | null; phone?: string | null }) : null}
          consultationId={consultationId ?? null}
        />

        <AlertDialog open={!!voidingDoc} onOpenChange={(v) => !v && setVoidingDoc(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Void this document?</AlertDialogTitle>
              <AlertDialogDescription>
                This action cannot be undone. The document will be permanently removed from this consultation.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={async () => {
                  if (!voidingDoc) return;
                  await deleteDoc.mutateAsync({
                    id: voidingDoc.id,
                    consultation_id: voidingDoc.consultation_id,
                  });
                  setVoidingDoc(null);
                }}
              >
                Void Document
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <ViewDocumentModal
          doc={viewingDoc}
          onClose={() => setViewingDoc(null)}
          onPrint={(d) => {
            setViewingDoc(null);
            printDocument(d);
          }}
        />

      </div>
    </div>
  );
}
