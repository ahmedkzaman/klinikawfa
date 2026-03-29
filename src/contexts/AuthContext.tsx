import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

export type AppRole = 'admin' | 'staff' | 'guest';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  rolesLoading: boolean;
  roles: AppRole[];
  isAdmin: boolean;
  isStaffOrAdmin: boolean;
  isGuest: boolean;
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
  const [roles, setRoles] = useState<AppRole[]>([]);

  // Refs to track state across the auth listener closure
  const authInitializedRef = useRef(false);
  const currentUserIdRef = useRef<string | null>(null);

  const fetchUserRoles = useCallback(async (userId: string) => {
    setRolesLoading(true);
    try {
      const { data, error } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', userId);

      if (error) {
        console.error('Error fetching roles:', error);
        setRoles([]);
        return;
      }

      const userRoles = data?.map(r => r.role as AppRole) || [];
      setRoles(userRoles);
    } catch (err) {
      console.error('Error in fetchUserRoles:', err);
      setRoles([]);
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
        fetchUserRoles(session.user.id);
      } else {
        setRolesLoading(false);
      }
    });

    // Set up auth state listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        const newUserId = session?.user?.id ?? null;

        // Skip redundant events when user hasn't changed and auth is already initialized
        if (
          authInitializedRef.current &&
          (event === 'TOKEN_REFRESHED' || event === 'INITIAL_SESSION') &&
          newUserId === currentUserIdRef.current
        ) {
          return;
        }

        currentUserIdRef.current = newUserId;
        setSession(session);
        setUser(session?.user ?? null);
        setLoading(false);

        if (session?.user) {
          // Only refetch roles when user actually changed
          setTimeout(() => {
            fetchUserRoles(session.user.id);
          }, 0);
        } else {
          setRoles([]);
          setRolesLoading(false);
        }
      }
    );

    return () => subscription.unsubscribe();
  }, [fetchUserRoles]);

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
    setRoles([]);
  };

  const resetPassword = async (email: string) => {
    const redirectUrl = `${window.location.origin}/auth/reset`;
    
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: redirectUrl,
    });
    return { error: error as Error | null };
  };

  const isAdmin = roles.includes('admin');
  const isStaffOrAdmin = roles.includes('admin') || roles.includes('staff');
  const isGuest = roles.length > 0 && !isStaffOrAdmin;

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        loading,
        rolesLoading,
        roles,
        isAdmin,
        isStaffOrAdmin,
        isGuest,
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
