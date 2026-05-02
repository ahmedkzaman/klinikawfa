import { useState } from 'react';
import { format } from 'date-fns';
import {
  ChevronDown,
  ChevronUp,
  FileText,
  Image as ImageIcon,
  Paperclip,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusBadge } from '@/components/clinic/StatusBadge';
import {
  usePatientVisitHistory,
  getAttachmentCount,
  type PatientVisitConsultation,
  type PatientVisitHistoryRow,
} from '@/hooks/patients/usePatientVisitHistory';
import { useConsultationAttachments } from '@/hooks/clinic/useAttachments';
import type { PatientRow, ClinicStatus } from '@/types/clinic';

/**
 * Lazy attachment list — calls `useConsultationAttachments` only when
 * actually mounted. Mounting is deferred until the doctor expands the row,
 * which avoids the N+1 signed-URL fan-out for patients with many visits.
 */
function VisitAttachmentList({ consultationId }: { consultationId: string }) {
  const { data: attachments = [], isLoading } =
    useConsultationAttachments(consultationId);

  if (isLoading) {
    return (
      <p className="text-[11px] text-muted-foreground mt-2">
        Loading attachments…
      </p>
    );
  }
  if (attachments.length === 0) {
    return (
      <p className="text-[11px] text-muted-foreground mt-2">
        No attachments on this visit.
      </p>
    );
  }

  return (
    <div className="mt-2 border-t pt-2">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">
        Attachments
      </p>
      <ul className="space-y-1">
        {attachments.map((a) => {
          const isImage = (a.content_type ?? '').startsWith('image/');
          const Icon = isImage ? ImageIcon : FileText;
          return (
            <li key={a.id} className="flex items-center gap-2 text-xs">
              <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <span className="truncate flex-1">{a.file_name}</span>
              {a.signedUrl && (
                <a
                  href={a.signedUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-primary hover:underline shrink-0"
                >
                  View
                </a>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function safeFormat(date: string | null | undefined, pattern: string): string {
  if (!date) return '—';
  try {
    return format(new Date(date), pattern);
  } catch {
    return '—';
  }
}

function capitalize(value: string | null | undefined): string {
  if (!value) return '—';
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/**
 * One visit row in the patient sheet. The header is a click target that
 * toggles `isExpanded`; only when expanded do we mount the attachment list,
 * which is the expensive (signed-URL fetching) child.
 *
 * The count badge uses `getAttachmentCount(consultation)` — that number comes
 * from the parent visit-history query (a single PostgREST aggregate), so the
 * badge is free even for collapsed rows.
 */
function VisitRow({ row }: { row: PatientVisitHistoryRow }) {
  const [isExpanded, setIsExpanded] = useState(false);

  const consultation: PatientVisitConsultation | null = Array.isArray(
    row.consultations,
  )
    ? row.consultations[0] ?? null
    : row.consultations;

  const doctor = consultation
    ? Array.isArray(consultation.doctors)
      ? consultation.doctors[0] ?? null
      : consultation.doctors
    : null;

  const doctorName = doctor?.name ?? '—';
  const clinicalNote =
    consultation?.case_note?.trim() ||
    consultation?.diagnosis_text?.trim() ||
    row.visit_notes?.trim() ||
    '';
  const dispenseNote = consultation?.dispense_note?.trim() ?? '';
  const billingItems = consultation?.consultation_items ?? [];

  const diagnosisPills = (consultation?.diagnosis_text ?? '')
    .split(/[,;]+/)
    .map((d) => d.trim())
    .filter(Boolean);

  const attachmentCount = getAttachmentCount(consultation);
  const Chevron = isExpanded ? ChevronUp : ChevronDown;

  return (
    <li className="rounded-lg border bg-card text-sm overflow-hidden">
      <button
        type="button"
        onClick={() => setIsExpanded((v) => !v)}
        className="w-full p-3 text-left hover:bg-muted/40 transition-colors"
      >
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
            <span className="font-medium text-foreground">
              {safeFormat(row.created_at, 'd MMM yyyy, h:mma')}
            </span>
            <span>·</span>
            <span className="font-mono">
              #{row.queue_number ?? '—'}
            </span>
            {attachmentCount > 0 && (
              <Badge
                variant="secondary"
                className="h-5 px-1.5 text-[10px] gap-1"
              >
                <Paperclip className="h-3 w-3" />
                {attachmentCount}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            <StatusBadge status={row.clinic_status as ClinicStatus} />
            <Chevron className="h-4 w-4 text-muted-foreground" />
          </div>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">Dr. {doctorName}</p>
        {diagnosisPills.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {diagnosisPills.slice(0, 4).map((d, i) => (
              <Badge
                key={`${d}-${i}`}
                variant="outline"
                className="h-5 px-1.5 text-[10px] font-normal bg-blue-50 text-blue-700 border-blue-200"
              >
                {d}
              </Badge>
            ))}
            {diagnosisPills.length > 4 && (
              <span className="text-[10px] text-muted-foreground self-center">
                +{diagnosisPills.length - 4}
              </span>
            )}
          </div>
        )}
        {clinicalNote && !isExpanded && (
          <p className="mt-1 text-xs text-foreground/80 line-clamp-2">
            {clinicalNote}
          </p>
        )}
      </button>

      {isExpanded && (
        <div className="px-3 pb-3 border-t bg-muted/10 space-y-3">
          {/* Clinical Notes */}
          {clinicalNote && (
            <div className="mt-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">
                Clinical Notes
              </p>
              <p className="text-xs text-foreground/90 whitespace-pre-wrap leading-relaxed">
                {clinicalNote}
              </p>
            </div>
          )}

          {/* Dispense Notes — visually distinct block */}
          {dispenseNote && (
            <div className="bg-slate-50 border-l-4 border-blue-200 pl-4 py-2 my-2 rounded-r">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-blue-700 mb-1">
                Dispense Notes
              </p>
              <p className="text-xs text-slate-700 whitespace-pre-wrap leading-relaxed">
                {dispenseNote}
              </p>
            </div>
          )}

          {/* Billing Items */}
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">
              Billing Items
            </p>
            {billingItems.length === 0 ? (
              <p className="text-[11px] text-muted-foreground italic">
                No billed items
              </p>
            ) : (
              <div className="rounded-md border divide-y">
                {billingItems.map((it) => {
                  const qty = Number(it.quantity ?? 0);
                  const price = Number(it.price ?? 0);
                  return (
                    <div
                      key={it.id}
                      className="flex justify-between items-start gap-4 w-full px-2 py-1.5"
                    >
                      <div className="flex-1 min-w-0 flex flex-col">
                        <span className="text-[11px] text-foreground/80 break-words">
                          {it.item_name}
                        </span>
                        <span className="text-[10px] text-muted-foreground tabular-nums">
                          Qty {qty} × RM {price.toFixed(2)}
                        </span>
                      </div>
                      <span className="shrink-0 text-right whitespace-nowrap text-[11px] font-medium tabular-nums">
                        RM {(qty * price).toFixed(2)}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {consultation?.id && (
            <VisitAttachmentList consultationId={consultation.id} />
          )}
        </div>
      )}
    </li>
  );
}

interface PatientProfileSheetProps {
  patient: PatientRow | null;
  isOpen: boolean;
  onClose: () => void;
  onRegisterVisit: (patient: PatientRow) => void;
}

export function PatientProfileSheet({
  patient,
  isOpen,
  onClose,
  onRegisterVisit,
}: PatientProfileSheetProps) {
  const { data: visits = [], isLoading } = usePatientVisitHistory(patient?.id ?? null);

  return (
    <Sheet open={isOpen} onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-lg flex flex-col p-0"
      >
        <SheetHeader className="p-6 pb-4 border-b">
          <SheetTitle className="text-xl">{patient?.name ?? 'Patient'}</SheetTitle>
          <SheetDescription className="font-mono text-xs">
            IC: {patient?.national_id ?? '—'}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
          {/* Demographics */}
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
              Details
            </h3>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
              <div>
                <dt className="text-muted-foreground text-xs">Phone</dt>
                <dd className="font-medium">{patient?.phone ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground text-xs">Date of birth</dt>
                <dd className="font-medium">
                  {safeFormat(patient?.date_of_birth, 'd MMM yyyy')}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground text-xs">Gender</dt>
                <dd className="font-medium">{capitalize(patient?.gender)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground text-xs">Registered</dt>
                <dd className="font-medium">
                  {safeFormat(patient?.created_at, 'd MMM yyyy')}
                </dd>
              </div>
            </dl>
          </section>

          {/* Visit history */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Recent visits
              </h3>
              {!isLoading && visits.length > 0 && (
                <span className="inline-flex items-center justify-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                  {visits.length}
                </span>
              )}
            </div>

            {isLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-20 w-full" />
                ))}
              </div>
            ) : visits.length === 0 ? (
              <p className="text-sm text-muted-foreground">No visits yet.</p>
            ) : (
              <ul className="space-y-2">
                {visits.map((row) => (
                  <VisitRow key={row.id} row={row} />
                ))}
              </ul>
            )}
          </section>
        </div>

        <SheetFooter className="p-6 pt-4 border-t">
          <Button
            className="w-full sm:w-auto"
            disabled={!patient}
            onClick={() => {
              if (!patient) return;
              onClose();
              onRegisterVisit(patient);
            }}
          >
            Register new visit
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
