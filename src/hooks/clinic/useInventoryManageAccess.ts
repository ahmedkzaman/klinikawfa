import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export type InventoryManageAccess = {
  canManage: boolean;
  canArchive: boolean;
  isLoading: boolean;
};

/**
 * Database-authoritative inventory access. canManage mirrors the
 * inventory.manage permission (role default + personal override, the same
 * flag can_manage_inventory() enforces in RLS). canArchive preserves the
 * stricter admin-only rule for catalogue deletion/archival.
 */
export function useInventoryManageAccess(): InventoryManageAccess {
  const { isAdmin, isSpecialAdmin, user } = useAuth();
  const [canManage, setCanManage] = useState<boolean | null>(null);

  useEffect(() => {
    if (!user) {
      setCanManage(false);
      return;
    }
    let cancelled = false;
    // can_manage_inventory(uuid) has no default argument — pass auth.uid()
    // explicitly so the PostgREST call resolves unambiguously.
    supabase
      .rpc('can_manage_inventory', { _user_id: user.id })
      .then(({ data, error }) => {
        if (cancelled) return;
        setCanManage(error ? false : Boolean(data));
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  return {
    canManage: canManage === true,
    canArchive: canManage === true && (isAdmin || isSpecialAdmin),
    isLoading: canManage === null,
  };
}
