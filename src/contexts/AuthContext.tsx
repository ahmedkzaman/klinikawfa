import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

export type AppRole =
  | 'special_admin'
  | 'admin'
  | 'doctor_admin'
  | 'operations'
  | 'staff'
  | 'locum'
  | 'resident_doctor'
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
  isOpsOrAdmin: boolean;
  isDoctorAdmin: boolean;
  isLocum: boolean;
  isClinical: boolean;
  canViewInsights: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string, fullName?: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<{ error: Error | null }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [rolesLoading, setRolesLoading] = useState(true);
  const [role, setRole] = useState<AppRole | null>(null);

  // Refs to track state across the auth listener closure
  const authInitializedRef = useRef(false);
  const currentUserIdRef = useRef<string | null>(null);

  const fetchUserRole = useCallback(async (userId: string) => {
    setRolesLoading(true);
    try {
      const { data, error } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', userId)
        .maybeSingle();

      if (error) {
        console.error('Error fetching role:', error);
        setRole(null);
        return;
      }

      setRole((data?.role as AppRole) ?? null);
    } catch (err) {
      console.error('Error in fetchUserRole:', err);
      setRole(null);
    } finally {
      setRolesLoading(false);
    }
  }, []);

  useEffect(() => {
    // Initialize session first
    supabase.auth.getSession().then(({ data: { session } }) => {
      currentUserIdRef.current = session?.user?.id ?? null;
      authInitializedRef.current = true;
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);

      if (session?.user) {
        fetchUserRole(session.user.id);
      } else {
        setRolesLoading(false);
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

        currentUserIdRef.current = newUserId;
        setSession(session);
        setUser(session?.user ?? null);
        setLoading(false);

        if (session?.user) {
          // Only refetch role when user actually changed
          setTimeout(() => {
            fetchUserRole(session.user.id);
          }, 0);
        } else {
          setRole(null);
          setRolesLoading(false);
        }
      }
    );

    return () => subscription.unsubscribe();
  }, [fetchUserRole]);

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
    currentUserIdRef.current = null;
    authInitializedRef.current = false;
    await supabase.auth.signOut();
    setRole(null);
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
    role === 'special_admin' ||
    role === 'operations' ||
    role === 'doctor_admin' ||
    role === 'resident_doctor';
  const isGuest = role === 'guest' || role === null;
  const isSpecialAdmin = role === 'special_admin';
  const isOperations = role === 'operations';
  const isOpsOrAdmin =
    role === 'operations' ||
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
  const canViewInsights =
    role === 'admin' || role === 'special_admin' || role === 'doctor_admin';

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
        isOpsOrAdmin,
        isDoctorAdmin,
        isLocum,
        isClinical,
        canViewInsights,
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
