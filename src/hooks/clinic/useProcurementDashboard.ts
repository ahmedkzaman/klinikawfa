import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  parseProcurementDashboardReport,
  type ProcurementDashboardReport,
} from '@/lib/clinic/procurementDashboard';

/**
 * Authoritative monthly budget snapshot + action centre, computed by the
 * get_procurement_dashboard Postgres RPC. Parsed with the domain contract so
 * malformed responses throw instead of displaying false zeroes.
 */
export function useProcurementDashboard(month: string) {
  return useQuery<ProcurementDashboardReport, Error>({
    queryKey: ['procurement', 'dashboard', month],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_procurement_dashboard', {
        _month: month,
      });
      if (error) throw error;
      return parseProcurementDashboardReport(data);
    },
    staleTime: 60_000,
  });
}

type ProcurementAccess = {
  canManage: boolean;
  canApprove: boolean;
  isLoading: boolean;
};

/**
 * Database-authoritative access flags. Neither value is inferred from a
 * frontend role name: canManage comes from can_manage_inventory and canApprove
 * from has_clinic_permission('procurement.approve').
 */
export function useProcurementAccess(): ProcurementAccess {
  const { data, isLoading } = useQuery({
    queryKey: ['procurement', 'access'],
    queryFn: async () => {
      const [manageRes, approveRes] = await Promise.all([
        supabase.rpc('can_manage_inventory'),
        supabase.rpc('has_clinic_permission', { _permission_key: 'procurement.approve' }),
      ]);
      if (manageRes.error) throw manageRes.error;
      if (approveRes.error) throw approveRes.error;
      return {
        canManage: Boolean(manageRes.data),
        canApprove: Boolean(approveRes.data),
      };
    },
    staleTime: 60_000,
  });

  return {
    canManage: data?.canManage ?? false,
    canApprove: data?.canApprove ?? false,
    isLoading,
  };
}
