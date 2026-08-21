import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  canManageTrackingSettingsRole,
  canManageWebsiteRole,
} from '@/lib/website-access';
import { ALL_INSIGHT_QUERY_ROOTS } from '@/hooks/clinic/useInsightSectionData';

type ManagementDashboardAccessRpc = (
  fn: 'can_view_management_dashboard',
  args: { _user_id: string },
) => Promise<{ data: boolean | null; error: { message: string } | null }>;

type InsightViewerScope = {
  allowed: boolean;
  role: AppRole | null;
  doctor_id: string | null;
  permission_version: string;
};

type InsightViewerScopeRpc = (
  fn: 'get_insight_viewer_scope',
) => Promise<{ data: InsightViewerScope | null; error: { message: string } | null }>;

export type AppRole =
  | 'special_admin'
  | 'admin'
  | 'doctor_admin'
  | 'purchaser'
  | 'staff_nurse'
  | 'ops_staff'
  | 'operations'
  | 'staff'
  | 'locum'
  | 'resident_doctor'
  | 'website_editor'
  | 'guest';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  rolesLoading: boolean;
  role: AppRole | null;
  isAdmin: boolean;
  isStaffOrAdmin: boolean;
  isGuest: boolean;
  isSpecialAdmin: boolean;
  isOperations: boolean;
  isOpsStaff: boolean;
  isOpsOrAdmin: boolean;
  isDoctorAdmin: boolean;
  isLocum: boolean;
  isClinical: boolean;
  canViewInsights: boolean;
  insightAccessLoading: boolean;
  insightDoctorId: string | null;
  insightPermissionVersion: string;
  canViewManagementDashboard: boolean;
  managementDashboardAccessLoading: boolean;
  canEditManagementDashboard: boolean;
  canManageWebsite: boolean;
  canManageTrackingSettings: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string, fullName?: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<{ error: Error | null }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [rolesLoading, setRolesLoading] = useState(true);
  const [role, setRole] = useState<AppRole | null>(null);
  const [canViewInsights, setCanViewInsights] = useState(false);
  const [insightAccessLoading, setInsightAccessLoading] = useState(true);
  const [insightDoctorId, setInsightDoctorId] = useState<string | null>(null);
  const [insightPermissionVersion, setInsightPermissionVersion] = useState('unresolved');
  const [canViewManagementDashboard, setCanViewManagementDashboard] = useState(false);
  const [managementDashboardAccessLoading, setManagementDashboardAccessLoading] = useState(true);

  // Refs to track state across the auth listener closure
  const authInitializedRef = useRef(false);
  const currentUserIdRef = useRef<string | null>(null);
  // Every access refresh owns a generation. A response may publish state only
  // while both its account and generation are still current.
  const accessGenerationRef = useRef(0);

  const clearInsightQueries = useCallback(() => {
    for (const queryKey of ALL_INSIGHT_QUERY_ROOTS) {
      void queryClient.cancelQueries({ queryKey });
      queryClient.removeQueries({ queryKey });
    }
  }, [queryClient]);

  const resetIdentityAccess = useCallback((signedOut = false) => {
    setRole(null);
    setCanViewInsights(false);
    setInsightDoctorId(null);
    setInsightPermissionVersion(signedOut ? 'signed-out' : 'transitioning');
    setCanViewManagementDashboard(false);
    setRolesLoading(!signedOut);
    setInsightAccessLoading(!signedOut);
    setManagementDashboardAccessLoading(!signedOut);
  }, []);

  const isCurrentAccessRequest = useCallback((userId: string, generation: number) => (
    currentUserIdRef.current === userId && accessGenerationRef.current === generation
  ), []);

  const fetchUserRole = useCallback(async (userId: string, generation: number) => {
    try {
      const { data, error } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', userId)
        .maybeSingle();

      if (error) {
        console.error('Error fetching role:', error);
        if (isCurrentAccessRequest(userId, generation)) setRole(null);
        return;
      }

      if (isCurrentAccessRequest(userId, generation)) setRole((data?.role as AppRole) ?? null);
    } catch (err) {
      console.error('Error in fetchUserRole:', err);
      if (isCurrentAccessRequest(userId, generation)) setRole(null);
    } finally {
      if (isCurrentAccessRequest(userId, generation)) setRolesLoading(false);
    }
  }, [isCurrentAccessRequest]);

  const fetchManagementDashboardAccess = useCallback(async (userId: string, generation: number) => {
    try {
      const fetchDashboardAccess = supabase.rpc.bind(supabase) as unknown as ManagementDashboardAccessRpc;
      const { data: canViewDashboard, error: dashboardError } =
        await fetchDashboardAccess('can_view_management_dashboard', { _user_id: userId });

      if (dashboardError) {
        console.error('Error fetching management dashboard access:', dashboardError);
        if (isCurrentAccessRequest(userId, generation)) setCanViewManagementDashboard(false);
      } else {
        if (isCurrentAccessRequest(userId, generation)) setCanViewManagementDashboard(canViewDashboard === true);
      }
    } catch (err) {
      console.error('Error fetching management dashboard access:', err);
      if (isCurrentAccessRequest(userId, generation)) setCanViewManagementDashboard(false);
    } finally {
      if (isCurrentAccessRequest(userId, generation)) setManagementDashboardAccessLoading(false);
    }
  }, [isCurrentAccessRequest]);

  const fetchInsightAccess = useCallback(async (userId: string, generation: number) => {
    try {
      const fetchViewerScope = supabase.rpc.bind(supabase) as unknown as InsightViewerScopeRpc;
      const { data, error } = await fetchViewerScope('get_insight_viewer_scope');
      const supportedInsightRoles: AppRole[] = [
        'special_admin', 'admin', 'doctor_admin', 'resident_doctor', 'ops_staff', 'operations',
      ];
      const appRoles: AppRole[] = [
        'special_admin', 'admin', 'doctor_admin', 'purchaser', 'staff_nurse', 'ops_staff',
        'operations', 'staff', 'locum', 'resident_doctor', 'website_editor', 'guest',
      ];
      const validVersion = typeof data?.permission_version === 'string' && data.permission_version.trim() !== '';
      const validRole = data?.role !== null && appRoles.includes(data?.role as AppRole);
      const validAllowedScope = data?.allowed === true
        && validRole
        && supportedInsightRoles.includes(data.role)
        && validVersion
        && (data.doctor_id === null || typeof data.doctor_id === 'string')
        && (data.role !== 'resident_doctor' || (typeof data.doctor_id === 'string' && data.doctor_id.trim() !== ''));
      const validDeniedScope = data?.allowed === false && validRole && validVersion;
      if (!isCurrentAccessRequest(userId, generation)) return;
      if (error || !data || (!validAllowedScope && !validDeniedScope)) {
        if (error) console.error('Error fetching Clinic Insight access:', error);
        setCanViewInsights(false);
        setInsightDoctorId(null);
        setInsightPermissionVersion('unavailable');
        return;
      }
      setRole(data.role);
      setRolesLoading(false);
      setCanViewInsights(validAllowedScope);
      setInsightDoctorId(validAllowedScope ? data.doctor_id : null);
      setInsightPermissionVersion(data.permission_version);
    } catch (err) {
      console.error('Error in fetchInsightAccess:', err);
      if (!isCurrentAccessRequest(userId, generation)) return;
      setCanViewInsights(false);
      setInsightDoctorId(null);
      setInsightPermissionVersion('unavailable');
    } finally {
      if (isCurrentAccessRequest(userId, generation)) setInsightAccessLoading(false);
    }
  }, [isCurrentAccessRequest]);

  useEffect(() => {
    // Initialize session first
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (authInitializedRef.current) return;
      currentUserIdRef.current = session?.user?.id ?? null;
      authInitializedRef.current = true;
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);

      if (session?.user) {
        const generation = ++accessGenerationRef.current;
        void fetchUserRole(session.user.id, generation);
        void fetchInsightAccess(session.user.id, generation);
        void fetchManagementDashboardAccess(session.user.id, generation);
      } else {
        setRolesLoading(false);
        setManagementDashboardAccessLoading(false);
        setInsightAccessLoading(false);
      }
    });

    // Set up auth state listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        const newUserId = session?.user?.id ?? null;

        // Skip ALL redundant events when user hasn't changed and auth is already initialized
        if (
          authInitializedRef.current &&
          newUserId === currentUserIdRef.current
        ) {
          return;
        }

        clearInsightQueries();
        const generation = ++accessGenerationRef.current;
        resetIdentityAccess(!session?.user);

        currentUserIdRef.current = newUserId;
        authInitializedRef.current = true;
        setSession(session);
        setUser(session?.user ?? null);
        setLoading(false);

        if (session?.user) {
          // Only refetch role when user actually changed
          setTimeout(() => {
            void fetchUserRole(session.user.id, generation);
            void fetchInsightAccess(session.user.id, generation);
            void fetchManagementDashboardAccess(session.user.id, generation);
          }, 0);
        } else {
          resetIdentityAccess(true);
        }
      },
    );

    // Explicit clinic-permission change (e.g. an admin edited this user's
    // access): fail closed — reset access state so guarded routes block until
    // the authoritative refresh completes.
    const refreshAfterPermissionChange = () => {
      const currentUserId = currentUserIdRef.current;
      if (currentUserId) {
        const generation = ++accessGenerationRef.current;
        resetIdentityAccess(false);
        clearInsightQueries();
        void fetchUserRole(currentUserId, generation);
        void fetchInsightAccess(currentUserId, generation);
        void fetchManagementDashboardAccess(currentUserId, generation);
      }
    };

    // Returning to the tab: re-fetch access in the background but keep the
    // last-known state mounted. Resetting the loading flags here makes
    // ClinicProtectedRoute unmount the active page behind a full-screen
    // spinner every time the user switches back to this tab — which looks
    // exactly like a page reload.
    const refreshDashboardAccess = () => {
      const currentUserId = currentUserIdRef.current;
      if (currentUserId) {
        const generation = ++accessGenerationRef.current;
        clearInsightQueries();
        void fetchUserRole(currentUserId, generation);
        void fetchInsightAccess(currentUserId, generation);
        void fetchManagementDashboardAccess(currentUserId, generation);
      }
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') refreshDashboardAccess();
    };
    window.addEventListener('clinic-permissions-changed', refreshAfterPermissionChange);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      subscription.unsubscribe();
      window.removeEventListener('clinic-permissions-changed', refreshAfterPermissionChange);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [clearInsightQueries, fetchInsightAccess, fetchManagementDashboardAccess, fetchUserRole, queryClient, resetIdentityAccess]);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    return { error: error as Error | null };
  };

  const signUp = async (email: string, password: string, fullName?: string) => {
    const redirectUrl = `${window.location.origin}/`;
    
    const { error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        emailRedirectTo: redirectUrl,
        data: {
          full_name: fullName?.trim(),
        },
      },
    });
    return { error: error as Error | null };
  };

  const signOut = async () => {
    clearInsightQueries();
    ++accessGenerationRef.current;
    currentUserIdRef.current = null;
    authInitializedRef.current = false;
    await supabase.auth.signOut();
    resetIdentityAccess(true);
  };

  const resetPassword = async (email: string) => {
    const redirectUrl = `${window.location.origin}/reset-password`;
    
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: redirectUrl,
    });
    return { error: error as Error | null };
  };

  const isAdmin = role === 'admin' || role === 'special_admin' || role === 'doctor_admin';
  // NOTE: 'locum' is intentionally excluded. Locums are independent
  // contractors and must NOT enter the HR/staff portal. Clinic-portal
  // access for locums is granted separately in ClinicProtectedRoute via
  // an `isStaffOrAdmin || isLocum` check on the `any_staff` gate.
  const isStaffOrAdmin =
    role === 'admin' ||
    role === 'staff' ||
    role === 'ops_staff' ||
    role === 'special_admin' ||
    role === 'operations' ||
    role === 'doctor_admin' ||
    role === 'purchaser' ||
    role === 'staff_nurse' ||
    role === 'resident_doctor';
  const isGuest = role === 'guest' || role === null;
  const isSpecialAdmin = role === 'special_admin';
  const isOperations = role === 'operations' || role === 'ops_staff';
  const isOpsStaff =
    role === 'ops_staff' || role === 'operations' || role === 'staff';
  const isOpsOrAdmin =
    role === 'operations' ||
    role === 'ops_staff' ||
    role === 'staff' ||
    role === 'admin' ||
    role === 'special_admin' ||
    role === 'doctor_admin' ||
    role === 'resident_doctor';
  const isDoctorAdmin = role === 'doctor_admin';
  const isLocum = role === 'locum';
  const isClinical =
    role === 'locum' ||
    role === 'doctor_admin' ||
    role === 'special_admin' ||
    role === 'admin' ||
    role === 'resident_doctor';
  const canEditManagementDashboard =
    role === 'admin' || role === 'special_admin' || role === 'doctor_admin';
  const canManageWebsite = canManageWebsiteRole(role);
  const canManageTrackingSettings = canManageTrackingSettingsRole(role);

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        loading,
        rolesLoading,
        role,
        isAdmin,
        isStaffOrAdmin,
        isGuest,
        isSpecialAdmin,
        isOperations,
        isOpsStaff,
        isOpsOrAdmin,
        isDoctorAdmin,
        isLocum,
        isClinical,
        canViewInsights,
        insightAccessLoading,
        insightDoctorId,
        insightPermissionVersion,
        canViewManagementDashboard,
        managementDashboardAccessLoading,
        canEditManagementDashboard,
        canManageWebsite,
        canManageTrackingSettings,
        signIn,
        signUp,
        signOut,
        resetPassword,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
