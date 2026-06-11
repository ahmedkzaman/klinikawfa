import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

/**
 * Plays a short chime via WebAudio.
 * variant 'doctor' = higher two-tone, 'ops' = lower three-tone.
 */
function playChime(variant: 'doctor' | 'ops') {
  try {
    const AudioCtx =
      (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const notes =
      variant === 'doctor'
        ? [{ f: 988, t: 0 }, { f: 1319, t: 0.18 }, { f: 1568, t: 0.36 }]
        : [{ f: 784, t: 0 }, { f: 587, t: 0.18 }, { f: 880, t: 0.36 }];
    const now = ctx.currentTime;
    notes.forEach(({ f, t }) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = f;
      gain.gain.setValueAtTime(0.0001, now + t);
      gain.gain.exponentialRampToValueAtTime(0.25, now + t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + t + 0.22);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + t);
      osc.stop(now + t + 0.25);
    });
    setTimeout(() => ctx.close().catch(() => {}), 1200);
  } catch {
    // ignore
  }
}

/**
 * Subscribes to clinic queue events and plays role-scoped chimes.
 * - Doctors hear a chime when a new patient is registered.
 * - Ops staff hear a chime when a patient is sent to dispensary.
 */
export function useClinicChimes() {
  const { role, isClinical, isOpsStaff } = useAuth();
  const isClinicalRef = useRef(isClinical);
  const isOpsRef = useRef(isOpsStaff);

  useEffect(() => {
    isClinicalRef.current = isClinical;
    isOpsRef.current = isOpsStaff;
  }, [isClinical, isOpsStaff]);

  useEffect(() => {
    if (!role) return;
    if (!isClinical && !isOpsStaff) return;

    const channel = supabase
      .channel('clinic-chimes')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'queue_entries' },
        (payload) => {
          if (!isClinicalRef.current) return;
          const row = payload.new as { clinic_status?: string; deleted_at?: string | null } | null;
          if (!row) return;
          if (row.deleted_at) return;
          if (row.clinic_status === 'registered' || row.clinic_status === 'ready_for_doctor') {
            playChime('doctor');
          }
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'queue_entries' },
        (payload) => {
          if (!isOpsRef.current) return;
          const next = payload.new as { clinic_status?: string; deleted_at?: string | null } | null;
          const prev = payload.old as { clinic_status?: string } | null;
          if (!next || next.deleted_at) return;
          if (
            next.clinic_status === 'sent_to_dispensary' &&
            prev?.clinic_status !== 'sent_to_dispensary'
          ) {
            playChime('ops');
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [role, isClinical, isOpsStaff]);
}
