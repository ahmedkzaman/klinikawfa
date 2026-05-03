import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export type PunchBuffers = {
  clock_in_early_min: number;
  clock_in_late_min: number;
  clock_out_early_min: number;
  clock_out_late_min: number;
};

export const DEFAULT_BUFFERS: PunchBuffers = {
  clock_in_early_min: 60,
  clock_in_late_min: 60,
  clock_out_early_min: 30,
  clock_out_late_min: 120,
};

// Higher number = higher priority when a user has multiple roles
const ROLE_PRIORITY: Record<string, number> = {
  special_admin: 100,
  admin: 90,
  doctor_admin: 80,
  operations: 70,
  staff: 50,
  locum: 40,
  guest: 10,
};

/**
 * Resolve punch buffers for a user. If `shiftKey` is provided, shift-aware
 * overrides are considered. Resolution priority (highest first):
 *   1. role + shift  (scope = 'role_shift')
 *   2. shift only    (scope = 'shift')
 *   3. role only     (scope = 'role')
 *   4. global        (scope = 'global')
 */
export function useUserPunchBuffers(userId: string | undefined, shiftKey?: string | null) {
  const [buffers, setBuffers] = useState<PunchBuffers>(DEFAULT_BUFFERS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;

    (async () => {
      setLoading(true);
      const [settingsRes, rolesRes] = await Promise.all([
        supabase.from('punch_buffer_settings').select('*'),
        supabase.from('user_roles').select('role').eq('user_id', userId),
      ]);

      if (cancelled) return;

      const settings = (settingsRes.data ?? []) as any[];
      const roles = (rolesRes.data ?? []).map((r: any) => r.role as string);

      const global = settings.find((s) => s.scope === 'global');
      const shiftRows = settings.filter((s) => s.scope === 'shift');
      const roleRows = settings.filter((s) => s.scope === 'role');
      const roleShiftRows = settings.filter((s) => s.scope === 'role_shift');

      // 1. role + shift (highest priority role wins)
      let chosen: any = null;
      if (shiftKey) {
        let chosenP = -1;
        for (const r of roles) {
          const row = roleShiftRows.find((s) => s.role === r && s.shift_key === shiftKey);
          if (row) {
            const p = ROLE_PRIORITY[r] ?? 0;
            if (p > chosenP) { chosen = row; chosenP = p; }
          }
        }
      }

      // 2. shift only
      if (!chosen && shiftKey) {
        chosen = shiftRows.find((s) => s.shift_key === shiftKey) ?? null;
      }

      // 3. role only (highest priority role wins)
      if (!chosen) {
        let chosenP = -1;
        for (const r of roles) {
          const row = roleRows.find((s) => s.role === r);
          if (row) {
            const p = ROLE_PRIORITY[r] ?? 0;
            if (p > chosenP) { chosen = row; chosenP = p; }
          }
        }
      }

      // 4. global
      if (!chosen) chosen = global;

      setBuffers(chosen ? pickFields(chosen) : DEFAULT_BUFFERS);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [userId, shiftKey]);

  return { buffers, loading };
}

function pickFields(row: any): PunchBuffers {
  return {
    clock_in_early_min: row.clock_in_early_min ?? 60,
    clock_in_late_min: row.clock_in_late_min ?? 60,
    clock_out_early_min: row.clock_out_early_min ?? 30,
    clock_out_late_min: row.clock_out_late_min ?? 120,
  };
}
