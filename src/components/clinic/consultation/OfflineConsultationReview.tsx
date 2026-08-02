import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { CheckCircle2, Clock3, History, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
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
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  OFFLINE_CONSULTATION_AUDIT_LIMIT,
  useOfflineConsultationAudit,
  useReviewOfflineConsultation,
  type OfflineConsultationAuditEntry,
} from '@/hooks/clinic/useOfflineConsultationApproval';

const STALE_REVIEW_MESSAGE =
  'This consultation changed. Reload and review the latest version.';

const AUDIT_ACTION_LABELS: Record<string, string> = {
  submitted: 'Created',
  updated: 'Edited',
  doctor_reassigned: 'Doctor reassigned',
  returned: 'Returned for correction',
  resubmitted: 'Resubmitted',
  approved: 'Approved',
};

type OfflineConsultationReviewProps = {
  consultationId: string;
  approvalStatus: 'pending' | 'returned' | 'approved' | null | undefined;
  approvalRevision: number;
  canReview: boolean;
};

type CompletedReview = {
  consultationId: string;
  revision: number;
};

function formatAuditTime(value: string) {
  const timestamp = new Date(value);
  return Number.isNaN(timestamp.getTime())
    ? value
    : format(timestamp, 'dd MMM yyyy, HH:mm');
}

function isStaleReviewError(error: unknown) {
  const message =
    error instanceof Error
      ? error.message
      : error && typeof error === 'object' && 'message' in error
        ? String(error.message)
        : String(error);
  return (
    message.includes('stale_offline_consultation') ||
    message.includes('offline_consultation_not_pending')
  );
}

export function OfflineConsultationReview({
  consultationId,
  approvalStatus,
  approvalRevision,
  canReview,
}: OfflineConsultationReviewProps) {
  const queryClient = useQueryClient();
  const review = useReviewOfflineConsultation();
  const audit = useOfflineConsultationAudit(consultationId);
  const [returnDialogOpen, setReturnDialogOpen] = useState(false);
  const [returnReason, setReturnReason] = useState('');
  const [returnReasonError, setReturnReasonError] = useState<string | null>(null);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [completedReview, setCompletedReview] = useState<CompletedReview | null>(null);
  const activeConsultationId = useRef(consultationId);
  activeConsultationId.current = consultationId;

  useEffect(() => {
    setReturnDialogOpen(false);
    setReturnReason('');
    setReturnReasonError(null);
    setReviewError(null);
    setCompletedReview(null);
  }, [consultationId]);

  const visibleAudit = (audit.data ?? []).slice(-OFFLINE_CONSULTATION_AUDIT_LIMIT);
  const showReviewControls =
    canReview &&
    approvalStatus === 'pending' &&
    !(
      completedReview?.consultationId === consultationId &&
      completedReview.revision === approvalRevision
    );

  const refreshAfterConflict = async () => {
    await Promise.allSettled([
      queryClient.invalidateQueries({ queryKey: ['consultation'] }),
      queryClient.invalidateQueries({ queryKey: ['consultation_history'] }),
      queryClient.invalidateQueries({
        queryKey: ['offline_consultation_audit', consultationId],
      }),
      audit.refetch(),
    ]);
  };

  const submitReview = async (action: 'approve' | 'return', reason: string | null) => {
    const reviewedConsultationId = consultationId;
    setReviewError(null);
    try {
      await review.mutateAsync({
        consultationId,
        action,
        reason,
        expectedRevision: approvalRevision,
      });
      if (activeConsultationId.current !== reviewedConsultationId) return false;

      setCompletedReview({
        consultationId: reviewedConsultationId,
        revision: approvalRevision,
      });
      void audit.refetch();
      toast.success(
        action === 'approve'
          ? 'Offline consultation approved'
          : 'Offline consultation returned for correction',
      );
      return true;
    } catch (error) {
      if (activeConsultationId.current !== reviewedConsultationId) return false;

      if (isStaleReviewError(error)) {
        if (action === 'return') {
          setReturnDialogOpen(false);
          setReturnReason('');
          setReturnReasonError(null);
        }
        setReviewError(STALE_REVIEW_MESSAGE);
        await refreshAfterConflict();
      } else {
        setReviewError('The review could not be completed. Try again.');
      }
      return false;
    }
  };

  const handleReturnDialogOpenChange = (open: boolean) => {
    setReturnDialogOpen(open);
    if (!open) {
      setReturnReason('');
      setReturnReasonError(null);
    }
  };

  const submitReturn = async () => {
    const reason = returnReason.trim();
    if (!reason) {
      setReturnReasonError('Enter a reason for correction.');
      return;
    }

    setReturnReasonError(null);
    if (await submitReview('return', reason)) {
      setReturnReason('');
      setReturnDialogOpen(false);
    }
  };

  return (
    <section
      aria-labelledby="offline-review-heading"
      className="border-y border-slate-200 bg-white px-4 py-4 shadow-sm md:px-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <History className="h-4 w-4 text-slate-500" />
          <h2 id="offline-review-heading" className="text-sm font-semibold text-slate-900">
            Offline consultation review
          </h2>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {approvalStatus && (
            <Badge variant="outline" className="capitalize">
              {approvalStatus}
            </Badge>
          )}
          {showReviewControls && (
            <>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={review.isPending}
                onClick={() => setReturnDialogOpen(true)}
              >
                <RotateCcw className="mr-2 h-4 w-4" />
                Return for correction
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={review.isPending}
                onClick={() => void submitReview('approve', null)}
              >
                <CheckCircle2 className="mr-2 h-4 w-4" />
                {review.isPending ? 'Reviewing...' : 'Approve'}
              </Button>
            </>
          )}
        </div>
      </div>

      {reviewError && (
        <Alert variant="destructive" className="mt-3" role="alert">
          <AlertDescription>{reviewError}</AlertDescription>
        </Alert>
      )}

      <div className="mt-4 border-t border-slate-100 pt-3">
        <h3 className="text-xs font-semibold uppercase text-slate-500">Audit history</h3>
        {audit.isLoading ? (
          <p className="mt-2 text-sm text-slate-500">Loading audit history...</p>
        ) : audit.error ? (
          <p className="mt-2 text-sm text-red-600">Audit history could not be loaded.</p>
        ) : visibleAudit.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">No audit events recorded.</p>
        ) : (
          <ol className="mt-2 divide-y divide-slate-100">
            {visibleAudit.map((entry: OfflineConsultationAuditEntry) => (
              <li key={entry.id} className="grid gap-1 py-2 text-sm sm:grid-cols-[minmax(0,1fr)_auto] sm:gap-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                    <span className="font-medium text-slate-800">
                      {AUDIT_ACTION_LABELS[entry.action] ?? entry.action}
                    </span>
                    <span className="text-slate-600">{entry.actor_name}</span>
                  </div>
                  {entry.reason && (
                    <p className="mt-1 whitespace-pre-wrap text-xs text-slate-600">
                      {entry.reason}
                    </p>
                  )}
                </div>
                <time
                  dateTime={entry.created_at}
                  className="inline-flex items-center gap-1 whitespace-nowrap text-xs text-slate-500"
                >
                  <Clock3 className="h-3.5 w-3.5" />
                  {formatAuditTime(entry.created_at)}
                </time>
              </li>
            ))}
          </ol>
        )}
      </div>

      <AlertDialog open={returnDialogOpen} onOpenChange={handleReturnDialogOpenChange}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Return consultation for correction?</AlertDialogTitle>
            <AlertDialogDescription>
              Operations staff will see the reason and can resubmit the corrected record.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            <Label htmlFor="offline-return-reason">Reason for correction</Label>
            <Textarea
              id="offline-return-reason"
              value={returnReason}
              onChange={(event) => {
                setReturnReason(event.target.value);
                if (returnReasonError) setReturnReasonError(null);
              }}
              aria-invalid={!!returnReasonError}
              aria-describedby={returnReasonError ? 'offline-return-reason-error' : undefined}
              rows={4}
              required
            />
            {returnReasonError && (
              <p id="offline-return-reason-error" className="text-sm text-red-600">
                {returnReasonError}
              </p>
            )}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={review.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={review.isPending}
              className="bg-amber-600 text-white hover:bg-amber-700"
              onClick={(event) => {
                event.preventDefault();
                void submitReturn();
              }}
            >
              {review.isPending ? 'Returning...' : 'Return consultation'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

export default OfflineConsultationReview;
