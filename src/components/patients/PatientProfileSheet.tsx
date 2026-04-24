import { format } from 'date-fns';
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
  type PatientVisitConsultation,
} from '@/hooks/patients/usePatientVisitHistory';
import type { PatientRow, ClinicStatus } from '@/types/clinic';

interface PatientProfileSheetProps {
  patient: PatientRow | null;
  isOpen: boolean;
  onClose: () => void;
  onRegisterVisit: (patient: PatientRow) => void;
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
                {visits.map((row) => {
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
                  const notes =
                    row.visit_notes ||
                    consultation?.case_note ||
                    consultation?.diagnosis_text ||
                    '';

                  return (
                    <li
                      key={row.id}
                      className="rounded-lg border bg-card p-3 text-sm"
                    >
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span className="font-medium text-foreground">
                            {safeFormat(row.created_at, 'd MMM yyyy, h:mma')}
                          </span>
                          <span>·</span>
                          <span className="font-mono">
                            #{row.queue_number ?? '—'}
                          </span>
                        </div>
                        <StatusBadge status={row.clinic_status as ClinicStatus} />
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Dr. {doctorName}
                      </p>
                      {notes && (
                        <p className="mt-1 text-xs text-foreground/80 line-clamp-2">
                          {notes}
                        </p>
                      )}
                    </li>
                  );
                })}
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
