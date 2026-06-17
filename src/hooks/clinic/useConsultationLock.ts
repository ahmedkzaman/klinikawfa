import { useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useLockConsultation } from './useConsultations';

export interface LockableConsultation {
  id?: string;
  locked_by?: string | null;
  locked_at?: string | null;
  status?: string;
}

/**
 * Pessimistic locking for a consultation.
 *
 * - Auto-claims the lock on mount when free.
 * - Releases on unmount (only if the current user holds it).
 * - Exposes a `forceUnlock` escape hatch for browser-crash recovery.
 *
 * The cart should be editable when `canEdit === true` (current user holds the
 * lock OR no lock present), regardless of dispensing status.
 */
export function useConsultationLock(
  consultation: LockableConsultation | null | undefined,
) {
  const { user } = useAuth();
  const lockMut = useLockConsultation();
  const claimedRef = useRef<string | null>(null);

  const lockedBy = consultation?.locked_by ?? null;
  const myUserId = user?.id ?? null;
  const isLockedByMe = !!lockedBy && lockedBy === myUserId;
  const isLockedByOther = !!lockedBy && lockedBy !== myUserId;
  const isCompleted = consultation?.status === 'completed';
  const canEdit = !isCompleted && (lockedBy === null || isLockedByMe);

  // Auto-claim when the consultation is free
  useEffect(() => {
    if (!consultation?.id || !myUserId || isCompleted) return;
    if (lockedBy === null && claimedRef.current !== consultation.id) {
      claimedRef.current = consultation.id;
      lockMut.mutate({ id: consultation.id, userId: myUserId });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [consultation?.id, lockedBy, myUserId, isCompleted]);

  // Release on unmount — only if I'm the holder
  useEffect(() => {
    return () => {
      if (
        consultation?.id &&
        claimedRef.current === consultation.id &&
        lockedBy === myUserId &&
        myUserId
      ) {
        lockMut.mutate({ id: consultation.id, userId: null });
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [consultation?.id]);

  const forceUnlock = () => {
    if (consultation?.id) {
      claimedRef.current = null;
      lockMut.mutate({ id: consultation.id, userId: null });
    }
  };

  return {
    isLockedByMe,
    isLockedByOther,
    canEdit,
    lockedBy,
    forceUnlock,
  };
}
