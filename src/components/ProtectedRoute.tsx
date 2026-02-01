import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Loader2 } from 'lucide-react';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requireAdmin?: boolean;
  requireStaffOrAdmin?: boolean;
}

export function ProtectedRoute({ 
  children, 
  requireAdmin = false, 
  requireStaffOrAdmin = false 
}: ProtectedRouteProps) {
  const { user, loading, rolesLoading, isAdmin, isStaffOrAdmin } = useAuth();
  const location = useLocation();

  // Wait for both session and roles when role-based access is required
  const needsRoleCheck = requireAdmin || requireStaffOrAdmin;
  if (loading || (needsRoleCheck && rolesLoading)) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" state={{ from: location }} replace />;
  }

  if (requireAdmin && !isAdmin) {
    return <Navigate to="/" replace />;
  }

  if (requireStaffOrAdmin && !isStaffOrAdmin) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
