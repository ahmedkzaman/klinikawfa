import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { AppRole } from '@/contexts/AuthContext';

export interface ClinicUserDoctor {
  id: string;
  name: string;
  status: 'active' | 'inactive';
  on_duty: boolean;
}

export interface ClinicUserRow {
  id: string;
  full_name: string | null;
  email: string;
  phone: string | null;
  mmc_number: string | null;
  requested_role: string | null;
  role: AppRole | null;
  doctor: ClinicUserDoctor | null;
}

/**
 * Fetches all profiles with their (single) role and (0/1) doctor profile.
 * Uses the explicit FKs `fk_user_roles_profile` and `fk_doctors_profile` so
 * PostgREST can resolve the embed unambiguously alongside the existing
 * auth.users foreign keys.
 */
export function useClinicUsers() {
  return useQuery<ClinicUserRow[]>({
    queryKey: ['clinic_users'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select(
          `id, full_name, email, phone, mmc_number, requested_role,
           user_roles!fk_user_roles_profile ( role ),
           doctors!fk_doctors_profile ( id, name, status, on_duty )`,
        )
        .order('full_name', { ascending: true });

      if (error) throw error;

      return (data ?? []).map((row: any): ClinicUserRow => {
        const roleRow = Array.isArray(row.user_roles) ? row.user_roles[0] : row.user_roles;
        const doctorRow = Array.isArray(row.doctors) ? row.doctors[0] : row.doctors;
        return {
          id: row.id,
          full_name: row.full_name ?? null,
          email: row.email,
          phone: row.phone ?? null,
          mmc_number: row.mmc_number ?? null,
          requested_role: row.requested_role ?? null,
          role: (roleRow?.role as AppRole) ?? null,
          doctor: doctorRow
            ? {
                id: doctorRow.id,
                name: doctorRow.name,
                status: doctorRow.status,
                on_duty: !!doctorRow.on_duty,
              }
            : null,
        };
      });
    },
  });
}
