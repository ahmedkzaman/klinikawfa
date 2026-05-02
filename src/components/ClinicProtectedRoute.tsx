import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Loader2 } from 'lucide-react';

interface ClinicProtectedRouteProps {
  children: React.ReactNode;
  requiredRole?: 'ops_or_admin' | 'special_admin' | 'admin' | 'insights';
}

/**
 * Gate for clinic-portal routes (queue, consultations, dispensary, etc.).
 *
 * - Waits for both session (`loading`) and role (`rolesLoading`) before deciding
 *   to avoid flicker / premature redirects on tab refocus.
 * - Unauthenticated users are sent to `/auth?redirect=<current-path>`.
 * - Authenticated users without the required role are sent back to
 *   `/staff/dashboard` (graceful in-portal fallback, not a 403 page).
 */
export function ClinicProtectedRoute({
  children,
  requiredRole = 'ops_or_admin',
}: ClinicProtectedRouteProps) {
  const { user, loading, rolesLoading, role, isOpsOrAdmin, isSpecialAdmin, isAdmin, canViewInsights } = useAuth();
  const location = useLocation();

  if (loading || rolesLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    const redirect = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/auth?redirect=${redirect}`} replace />;
  }

  // Guest firewall: guests are quarantined to public marketing pages and /video-call*.
  if (role === 'guest') {
    return <Navigate to="/" replace />;
  }

  const hasAccess =
    requiredRole === 'special_admin'
      ? isSpecialAdmin
      : requiredRole === 'admin'
        ? isAdmin || isSpecialAdmin
        : requiredRole === 'insights'
          ? canViewInsights
          : isOpsOrAdmin;

  if (!hasAccess) {
    return <Navigate to="/staff/dashboard" replace />;
  }

  return <>{children}</>;
}
