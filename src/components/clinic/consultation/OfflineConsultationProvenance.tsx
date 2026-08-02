import { AlertCircle, CheckCircle2, Clock3, UserRound } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { EligibleOfflineDoctor } from '@/hooks/clinic/useOfflineConsultationApproval';
import { format } from 'date-fns';

type OfflineApprovalStatus = 'pending' | 'returned' | 'approved' | null;

type OfflineConsultationProvenanceProps = {
  doctors: EligibleOfflineDoctor[];
  doctorId: string;
  currentDoctorName?: string | null;
  originalConsultedAt: string;
  enteringStaffName: string;
  enteredAt?: string | null;
  approvalStatus: OfflineApprovalStatus;
  returnReason: string | null;
  approvedByName: string | null;
  approvedAt?: string | null;
  disabled: boolean;
  onDoctorChange: (doctorId: string) => void;
  onOriginalConsultedAtChange: (value: string) => void;
};

const approvalLabels: Record<NonNullable<OfflineApprovalStatus>, string> = {
  pending: 'Pending approval',
  returned: 'Returned',
  approved: 'Approved',
};

export function OfflineConsultationProvenance({
  doctors,
  doctorId,
  currentDoctorName,
  originalConsultedAt,
  enteringStaffName,
  enteredAt,
  approvalStatus,
  returnReason,
  approvedByName,
  approvedAt,
  disabled,
  onDoctorChange,
  onOriginalConsultedAtChange,
}: OfflineConsultationProvenanceProps) {
  const statusLabel = approvalStatus ? approvalLabels[approvalStatus] : 'Not submitted';
  const selectedDoctorName =
    doctors.find((doctor) => doctor.id === doctorId)?.name ?? currentDoctorName;

  return (
    <section
      aria-labelledby="offline-provenance-heading"
      className="border-y border-slate-200 bg-white px-5 py-4"
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 id="offline-provenance-heading" className="text-sm font-semibold text-slate-800">
            Offline consultation provenance
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Record who consulted the patient and when the consultation originally happened.
          </p>
        </div>
        <Badge
          variant="secondary"
          className={
            approvalStatus === 'returned'
              ? 'border-amber-200 bg-amber-50 text-amber-800'
              : approvalStatus === 'approved'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                : 'border-blue-200 bg-blue-50 text-blue-800'
          }
        >
          {statusLabel}
        </Badge>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="offline-consulting-doctor">Consulting doctor</Label>
          <Select value={doctorId} onValueChange={onDoctorChange} disabled={disabled}>
            <SelectTrigger id="offline-consulting-doctor">
              <SelectValue placeholder="Select an active doctor">
                {selectedDoctorName}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {doctors.map((doctor) => (
                <SelectItem key={doctor.id} value={doctor.id}>
                  {doctor.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {doctors.length === 0 && (
            <p className="text-xs text-amber-700">No active consulting doctors are available.</p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="offline-original-consulted-at">
            Original consultation date and time
          </Label>
          <Input
            id="offline-original-consulted-at"
            type="datetime-local"
            value={originalConsultedAt}
            disabled={disabled}
            onChange={(event) => onOriginalConsultedAtChange(event.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <Label>Entering staff</Label>
          <div className="flex min-h-10 items-center gap-2 rounded-md border bg-slate-50 px-3 text-sm text-slate-700">
            <UserRound className="h-4 w-4 text-slate-400" />
            <span>{enteringStaffName}</span>
          </div>
          {enteredAt && (
            <p className="text-xs text-slate-500">
              Entered {format(new Date(enteredAt), 'd MMM yyyy, HH:mm')}
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label>Approved by</Label>
          <div className="flex min-h-10 items-center gap-2 rounded-md border bg-slate-50 px-3 text-sm text-slate-700">
            {approvedByName ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            ) : (
              <Clock3 className="h-4 w-4 text-slate-400" />
            )}
            <span>{approvedByName ?? 'Not approved'}</span>
          </div>
          {approvedAt && (
            <p className="text-xs text-slate-500">
              Approved {format(new Date(approvedAt), 'd MMM yyyy, HH:mm')}
            </p>
          )}
        </div>
      </div>

      {approvalStatus === 'returned' && returnReason && (
        <Alert className="mt-4 border-amber-200 bg-amber-50 text-amber-900">
          <AlertCircle className="h-4 w-4 text-amber-700" />
          <AlertDescription>
            <span className="font-medium">Return reason:</span> {returnReason}
          </AlertDescription>
        </Alert>
      )}
    </section>
  );
}
