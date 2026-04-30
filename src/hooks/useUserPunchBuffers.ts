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

export function useUserPunchBuffers(userId: string | undefined) {
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

      const settings = settingsRes.data ?? [];
      const roles = (rolesRes.data ?? []).map((r: any) => r.role as string);

      const global = settings.find((s: any) => s.scope === 'global');
      const roleRows = settings.filter((s: any) => s.scope === 'role');

      // Pick the highest-priority role the user has that also has an override row
      let chosen: any = null;
      let chosenPriority = -1;
      for (const r of roles) {
        const row = roleRows.find((s: any) => s.role === r);
        if (row) {
          const p = ROLE_PRIORITY[r] ?? 0;
          if (p > chosenPriority) {
            chosen = row;
            chosenPriority = p;
          }
        }
      }

      const resolved: PunchBuffers = chosen
        ? pickFields(chosen)
        : global
          ? pickFields(global)
          : DEFAULT_BUFFERS;

      setBuffers(resolved);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [userId]);

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
