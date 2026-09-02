import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';

/**
 * Route guard for the HR admin subtree (/staff/admin/*). The sidebar only
 * hides these links — it never blocked direct URL access. Admin and
 * special_admin pass; everyone else bounces back to the staff dashboard
 * (stays in-portal, consistent with the layout's other redirects).
 */
export function StaffAdminRoute({ children }: { children: React.ReactNode }) {
  const { isAdmin, isSpecialAdmin } = useAuth();
  if (!isAdmin && !isSpecialAdmin) {
    return <Navigate to="/staff/dashboard" replace />;
  }
  return <>{children}</>;
}
