import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, Info, Printer } from 'lucide-react';
import { PrintReceiptDialog } from '@/components/clinic/billing/PrintReceiptDialog';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { StatusBadge } from '@/components/clinic/StatusBadge';
import { FollowUpScheduler } from '@/components/clinic/patient/FollowUpScheduler';
import { VisitDetailsColumn } from '@/components/clinic/visit/VisitDetailsColumn';
import { AttachmentsCard } from '@/components/clinic/visit/AttachmentsCard';
import { BillingDetailsColumn, type SelectedCharge } from '@/components/clinic/visit/BillingDetailsColumn';
import { DispensePanel } from '@/components/clinic/visit/DispensePanel';
import { PatientAlertBanner } from '@/components/clinic/PatientAlertBanner';
import { VisitRemarksBanner } from '@/components/clinic/VisitRemarksBanner';
import {
  useConsultationQueueEntries,
  useUpdateQueueEntry,
} from '@/hooks/clinic/useQueueEntries';
import {
  useConsultation,
  useUpdateConsultation,
} from '@/hooks/clinic/useConsultations';
import { useConsultationLock } from '@/hooks/clinic/useConsultationLock';
import { ConsultationLockBanner } from '@/components/clinic/consultation/ConsultationLockBanner';
import { useConsultationItems, useAddConsultationItem } from '@/hooks/clinic/useConsultationItems';
import { usePayments } from '@/hooks/clinic/usePayments';
import { CatalogItemPicker } from '@/components/clinic/visit/CatalogItemPicker';
import { EditInstructionsDialog } from '@/components/clinic/visit/EditInstructionsDialog';
import type { ConsultationItemRow } from '@/types/clinic';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import { formatQueueNo } from '@/lib/clinic/queueNumber';
import {
  bento,
  bentoHeader,
  pageInner,
  pageShell,
  primaryBtn,
  secondaryBtn,
} from '@/lib/clinic/bentoTokens';

export default function DispenseCheckout() {
  const { queueEntryId } = useParams<{ queueEntryId: string }>();
  const navigate = useNavigate();

  const { data: entries = [], isLoading: entriesLoading } =
    useConsultationQueueEntries();
  const updateQueue = useUpdateQueueEntry();
  const updateConsultation = useUpdateConsultation();
  const addConsultationItem = useAddConsultationItem();

  const [selectedCharges, setSelectedCharges] = useState<SelectedCharge[]>([]);
  const [editingItem, setEditingItem] = useState<ConsultationItemRow | null>(null);
  const handleChargesChange = useCallback((c: SelectedCharge[]) => {
    setSelectedCharges(c);
  }, []);

  const entry = useMemo(
    () => entries.find((e) => e.id === queueEntryId),
    [entries, queueEntryId],
  );

  const { data: consultation, refetch: refetchConsultation } = useConsultation(queueEntryId);
  const { data: items = [] } = useConsultationItems(consultation?.id);
  const { data: payments = [] } = usePayments(queueEntryId);
  const { isLockedByOther, canEdit, forceUnlock } = useConsultationLock(
    consultation as
      | { id?: string; locked_by?: string | null; status?: string }
      | null
      | undefined,
  );
  const qc = useQueryClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const isDirectSale = (entry as any)?.visit_type === 'direct_sale';
  // Dispensary override: once the visit reaches dispensing/payment the doctor's
  // pessimistic lock no longer applies — pharmacy/cashier must be able to add,
  // edit, and remove items even if the doctor never released the lock.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const isDispensingStage = (entry as any)?.clinic_status === 'dispensing_payment';
  const dispensaryCanEdit = isDispensingStage ? true : canEdit;


  // Panel billing context: name + medication discount % drive the
  // "Panel Billing Applied" badge and the per-row strikethrough pricing.
  const panelId =
    (entry as unknown as { panel_id?: string | null } | undefined)?.panel_id ?? null;
  const [panelInfo, setPanelInfo] = useState<{
    name: string;
    medication_discount_pct: number;
    consultation_fee_override: number | null;
  } | null>(null);
  useEffect(() => {
    let cancelled = false;
    if (!panelId) {
      setPanelInfo(null);
      return;
    }
    (async () => {
      const { data, error } = await supabase
        .from('insurance_providers')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .select('name, medication_discount_pct, consultation_fee_override' as any)
        .eq('id', panelId)
        .maybeSingle();
      if (cancelled) return;
      if (error || !data) {
        setPanelInfo(null);
        return;
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const d = data as any;
      setPanelInfo({
        name: d.name ?? 'Panel',
        medication_discount_pct: Number(d.medication_discount_pct ?? 0),
        consultation_fee_override:
          d.consultation_fee_override == null ? null : Number(d.consultation_fee_override),
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [panelId]);

  // For Direct Sale visits, auto-create a placeholder consultation row so the
  // existing pricing / dispensing pipeline can record items without a doctor.
  const directSaleConsultRef = useRef(false);
  useEffect(() => {
    if (!isDirectSale) return;
    if (!entry || !queueEntryId) return;
    if (consultation?.id) return;
    if (directSaleConsultRef.current) return;
    directSaleConsultRef.current = true;
    (async () => {
      const { error } = await supabase.from('consultations').insert({
        queue_entry_id: queueEntryId,
        patient_id: entry.patient_id,
        doctor_id: null,
        status: 'in_progress',
        case_note: 'Direct Sale (OTC counter sale)',
        diagnosis_text: '',
        dispense_note: '',
      });
      if (error) {
        directSaleConsultRef.current = false;
        toast.error(`Failed to start direct sale: ${error.message}`);
        return;
      }
      qc.invalidateQueries({ queryKey: ['consultation', queueEntryId] });
      refetchConsultation();
    })();
  }, [isDirectSale, entry, queueEntryId, consultation?.id, qc, refetchConsultation]);

  const advancedRef = useRef(false);
  useEffect(() => {
    if (advancedRef.current) return;
    if (!entry || !queueEntryId) return;
    if (entry.clinic_status === 'sent_to_dispensary') {
      advancedRef.current = true;
      updateQueue.mutate({
        id: queueEntryId,
        clinic_status: 'dispensing_payment',
      });
    }
  }, [entry, queueEntryId, updateQueue]);

  const subtotal = useMemo(
    () =>
      items.reduce((acc, item) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const dispensed = (item as any).dispensed_qty as number | null;
        const qty =
          dispensed != null && item.item_id ? dispensed : Number(item.quantity ?? 0);
        return acc + Number(item.price ?? 0) * qty;
      }, 0),
    [items],
  );
  const paid = useMemo(
    () => payments.reduce((acc, p) => acc + Number(p.amount ?? 0), 0),
    [payments],
  );
  const outstanding = Math.max(subtotal - paid, 0);
  const [printPaymentId, setPrintPaymentId] = useState<string | null>(null);
  const latestPaymentId = useMemo(() => {
    if (!payments.length) return null;
    const sorted = [...payments].sort(
      (a, b) =>
        new Date(b.created_at ?? 0).getTime() -
        new Date(a.created_at ?? 0).getTime(),
    );
    return sorted[0]?.id ?? null;
  }, [payments]);

  const anyPartialMissingReason = useMemo(
    () =>
      items.some((it) => {
        if (!it.item_id) return false;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const dispensed = (it as any).dispensed_qty as number | null;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const reason = (it as any).partial_reason as string | null;
        if (dispensed == null) return false;
        return dispensed < Number(it.quantity ?? 0) && !reason;
      }),
    [items],
  );

  const handleComplete = async () => {
    if (!queueEntryId || !consultation?.id) return;
    try {
      // Batch-commit Other Charges as consultation_items first.
      if (selectedCharges.length > 0) {
        await Promise.all(
          selectedCharges.map((c) =>
            addConsultationItem.mutateAsync({
              consultation_id: consultation.id,
              item_name: c.name,
              quantity: 1,
              price: c.amount,
            }),
          ),
        );
      }
      await updateConsultation.mutateAsync({
        id: consultation.id,
        status: 'completed',
      });
      await updateQueue.mutateAsync({
        id: queueEntryId,
        clinic_status: 'completed',
      });
      toast.success('Checkout completed');
      navigate('/clinic/dispensary');
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  if (entriesLoading) {
    return (
      <div className={pageShell}>
        <div className={cn(pageInner, 'space-y-4')}>
          <Skeleton className="h-10 w-64 rounded-xl" />
          <div className="grid lg:grid-cols-[280px_1fr_360px] gap-4">
            <Skeleton className="h-96 rounded-2xl" />
            <Skeleton className="h-96 rounded-2xl" />
            <Skeleton className="h-96 rounded-2xl" />
          </div>
        </div>
      </div>
    );
  }

  if (!entry) {
    return (
      <div className={pageShell}>
        <div className={cn(bento, 'max-w-2xl mx-auto text-center py-20 px-6')}>
          <h2 className="text-lg font-semibold text-slate-800">Queue entry not found</h2>
          <p className="text-sm text-slate-500 mt-1">
            It may have been completed or cancelled.
          </p>
          <Button
            className={cn(secondaryBtn, 'mt-4')}
            onClick={() => navigate('/clinic/dispensary')}
          >
            <ArrowLeft className="h-4 w-4 mr-2" /> Back to Dispensary
          </Button>
        </div>
      </div>
    );
  }

  const patient = entry.patients;
  const dob = patient?.date_of_birth
    ? format(new Date(patient.date_of_birth), 'd MMM yyyy')
    : '—';

  return (
    <div className={pageShell}>
      <div className={cn(pageInner, 'pb-24')}>
        {/* Header */}
        <div className={cn(bento, 'flex items-center gap-3 flex-wrap p-4')}>
          <Button
            variant="ghost"
            size="sm"
            className="rounded-lg text-slate-600 hover:bg-slate-50"
            onClick={() => navigate('/clinic/dispensary')}
          >
            <ArrowLeft className="h-4 w-4 mr-1.5" /> Back
          </Button>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold text-slate-900 truncate">
              {patient?.name ?? 'Unknown patient'}
            </h1>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mt-0.5">
              Queue {formatQueueNo(entry.created_at, entry.queue_sequence)} · Checkout
            </p>
          </div>
          <StatusBadge status={entry.clinic_status} />
        </div>

        <PatientAlertBanner
          patientName={patient?.name ?? 'Patient'}
          remarks={(patient as { panel_remarks?: string | null } | null)?.panel_remarks}
        />

        <VisitRemarksBanner remarks={(entry as { visit_remarks?: string | null } | undefined)?.visit_remarks} />

        {panelInfo && (
          <div className={cn(bento, 'p-3 flex items-center gap-2 flex-wrap')}>
            <Badge className="bg-primary text-primary-foreground hover:bg-primary">
              Panel Billing Applied: {panelInfo.name}
            </Badge>
            {panelInfo.consultation_fee_override != null && (
              <span className="text-xs text-muted-foreground">
                Consultation fee fixed at RM {panelInfo.consultation_fee_override.toFixed(2)}
              </span>
            )}
            {panelInfo.medication_discount_pct > 0 && (
              <span className="text-xs text-muted-foreground">
                Medication discount: {panelInfo.medication_discount_pct}%
              </span>
            )}
          </div>
        )}

        {isLockedByOther && (
          <ConsultationLockBanner onForceUnlock={forceUnlock} />
        )}


        {/* 3-column workspace */}
        <div className="grid lg:grid-cols-[280px_1fr_360px] gap-4 items-start">
          {/* Patient summary */}
          <div className={cn(bento, 'p-4 space-y-3 text-sm')}>
            <h2 className={bentoHeader}>Patient</h2>
            <Field label="Name" value={patient?.name ?? '—'} />
            <Field label="IC / NRIC" value={patient?.national_id ?? '—'} />
            <Field label="Phone" value={patient?.phone ?? '—'} />
            <Field label="Date of Birth" value={dob} />
            <Field
              label="Gender"
              value={patient?.gender ? String(patient.gender) : '—'}
            />
            <div className="border-t border-slate-100 pt-3 mt-3 space-y-3">
              <Field
                label="Doctor"
                value={
                  (consultation as { doctors?: { name?: string } } | undefined)
                    ?.doctors?.name ??
                  entry.doctors?.name ??
                  '—'
                }
              />
              <Field
                label="Diagnosis"
                value={
                  consultation?.diagnosis_text?.trim() ||
                  (consultation as { diagnoses?: { name?: string } } | undefined)
                    ?.diagnoses?.name ||
                  '—'
                }
              />
            </div>
          </div>

          {/* Items */}
          <div className="space-y-4">
            <CatalogItemPicker
              consultationId={consultation?.id ?? null}
              disabled={!dispensaryCanEdit}
              mode={isDirectSale ? 'direct_sale' : 'consultation'}
              onItemAdded={(row) => setEditingItem(row)}
            />


            {!isDirectSale && consultation?.dispense_note?.trim() && (
              <Alert className="bg-amber-50 border-none rounded-2xl">
                <Info className="h-4 w-4 text-amber-700" />
                <AlertTitle className="text-amber-900 font-semibold">
                  Doctor's Instructions
                </AlertTitle>
                <AlertDescription className="whitespace-pre-wrap text-amber-900/90">
                  {consultation.dispense_note}
                </AlertDescription>
              </Alert>
            )}
            <VisitDetailsColumn
              consultationId={consultation?.id}
              canEdit={dispensaryCanEdit}
              canEditInstructions
              patientName={patient?.name ?? null}
            />


            {!isDirectSale && (
              <DispensePanel
                items={items}
                consultationId={consultation?.id ?? null}
                panelDiscountPct={panelInfo?.medication_discount_pct ?? 0}
              />
            )}

            {!isDirectSale && <AttachmentsCard consultationId={consultation?.id} />}

            {!isDirectSale && (consultation?.patient_id || entry.patient_id) && (
              <FollowUpScheduler
                patientId={(consultation?.patient_id ?? entry.patient_id) as string}
                defaultDoctorId={consultation?.doctor_id ?? null}
              />
            )}
          </div>

          {/* Billing */}
          <BillingDetailsColumn
            queueEntryId={queueEntryId!}
            consultationId={consultation?.id ?? null}
            items={items}
            payments={payments}
            showOtherCharges
            onChargesChange={handleChargesChange}
          />
        </div>

        {/* Footer action */}
        <div className="fixed bottom-0 left-0 right-0 lg:left-60 z-30 bg-white/90 backdrop-blur-md border-t border-slate-100 px-4 md:px-6 py-3 flex items-center justify-end gap-3">
          <div className="text-sm text-slate-500 hidden sm:block">
            Outstanding:{' '}
            <span className="font-semibold text-slate-900 tabular-nums">
              RM {outstanding.toFixed(2)}
            </span>
          </div>
          {latestPaymentId && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPrintPaymentId(latestPaymentId)}
            >
              <Printer className="h-4 w-4 mr-2" />
              Print Receipt
            </Button>
          )}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span>
                  <Button
                    className={primaryBtn}
                    onClick={handleComplete}
                    disabled={
                      outstanding > 0 ||
                      anyPartialMissingReason ||
                      !consultation?.id ||
                      updateQueue.isPending ||
                      updateConsultation.isPending
                    }
                  >
                    <CheckCircle2 className="h-4 w-4 mr-2" />
                    Complete Checkout
                  </Button>
                </span>
              </TooltipTrigger>
              {outstanding > 0 && (
                <TooltipContent>
                  Settle outstanding balance before completing checkout.
                </TooltipContent>
              )}
              {anyPartialMissingReason && (
                <TooltipContent>
                  Select a reason for every partially dispensed item.
                </TooltipContent>
              )}
              {!consultation?.id && (
                <TooltipContent>
                  No consultation found for this queue entry.
                </TooltipContent>
              )}
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>
      <EditInstructionsDialog
        item={editingItem}
        open={editingItem !== null}
        onOpenChange={(o) => !o && setEditingItem(null)}
      />
      <PrintReceiptDialog
        open={!!printPaymentId}
        onOpenChange={(o) => !o && setPrintPaymentId(null)}
        paymentId={printPaymentId}
      />
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-2">
      <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
        {label}
      </span>
      <span className="text-sm text-right text-slate-800 break-words max-w-[60%]">
        {value}
      </span>
    </div>
  );
}
