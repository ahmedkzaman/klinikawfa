import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Loader2 } from 'lucide-react';

interface ClinicProtectedRouteProps {
  children: React.ReactNode;
  requiredRole?:
    | 'any_staff'
    | 'non_locum_staff'
    | 'management_dashboard'
    | 'clinical'
    | 'clinical_staff'
    | 'ops_or_admin'
    | 'billing_or_purchaser'
    | 'special_admin'
    | 'admin'
    | 'insights';
}

/**
 * Gate for clinic-portal routes.
 *
 * Tiers:
 * - any_staff: Front-door of /clinic. Admits any non-guest employee
 *   (locum, staff, operations, doctor_admin, admin, special_admin).
 * - clinical: Locum + admins, plus exact operations staff in explicit
 *   offline-consultation entry mode.
 * - ops_or_admin: Operations + admins (billings, inventory, settings).
 * - admin / special_admin / insights: existing higher tiers.
 */
export function ClinicProtectedRoute({
  children,
  requiredRole = 'ops_or_admin',
}: ClinicProtectedRouteProps) {
  const {
    user,
    loading,
    rolesLoading,
    role,
    isStaffOrAdmin,
    isOpsOrAdmin,
    isSpecialAdmin,
    isAdmin,
    isClinical,
    isLocum,
    canViewInsights,
  } = useAuth();
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

  // Clinical-only routes: bounce non-clinical staff back to the queue (in-portal),
  // never out of /clinic — they still belong here for other tasks.
  if (requiredRole === 'clinical') {
    const isOfflineOpsEntry =
      role === 'ops_staff' &&
      new URLSearchParams(location.search).get('mode') === 'offline';
    if (!isClinical && !isOfflineOpsEntry) {
      return <Navigate to="/clinic/queue" replace />;
    }
    return <>{children}</>;
  }

  // Clinical-but-not-locum routes (e.g. Patients): in-portal bounce for locums.
  if (requiredRole === 'clinical_staff') {
    if (isLocum) return <Navigate to="/clinic/queue" replace />;
    if (!isClinical) return <Navigate to="/clinic/queue" replace />;
    return <>{children}</>;
  }

  if (requiredRole === 'non_locum_staff') {
    if (isLocum) return <Navigate to="/clinic/queue" replace />;
    if (!isStaffOrAdmin) return <Navigate to="/staff/dashboard" replace />;
    return <>{children}</>;
  }

  if (requiredRole === 'management_dashboard') {
    if (isLocum || role === 'ops_staff' || role === 'operations') {
      return <Navigate to="/clinic/queue" replace />;
    }
    if (!isStaffOrAdmin) return <Navigate to="/staff/dashboard" replace />;
    return <>{children}</>;
  }

  // Locums are excluded from `isStaffOrAdmin` (HR-staff flag) but still
  // need to enter the /clinic portal for their consultation work. Treat
  // `any_staff` as "anyone with a clinic keycard", which includes locums.
  const passesAnyStaff = isStaffOrAdmin || isLocum;

  const hasAccess =
    requiredRole === 'any_staff'
      ? passesAnyStaff
      : requiredRole === 'billing_or_purchaser'
        ? isOpsOrAdmin || role === 'purchaser'
      : requiredRole === 'special_admin'
        ? isSpecialAdmin
        : requiredRole === 'admin'
          ? isAdmin || isSpecialAdmin
          : requiredRole === 'insights'
            ? canViewInsights
            : isOpsOrAdmin;

  if (!hasAccess) {
    // Locums get bounced back to their queue, not the staff portal.
    if (isLocum) return <Navigate to="/clinic/queue" replace />;
    return <Navigate to="/staff/dashboard" replace />;
  }

  return <>{children}</>;
}
