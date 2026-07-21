import { Navigate, useLocation } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

function EditorLoadingState() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50" role="status">
      <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      <span className="sr-only">Loading website editor</span>
    </div>
  );
}

export function EditorProtectedRoute({
  children,
  requireTrackingSettings = false,
}: {
  children: React.ReactNode;
  requireTrackingSettings?: boolean;
}) {
  const { user, loading, rolesLoading, canManageWebsite, canManageTrackingSettings } = useAuth();
  const location = useLocation();

  if (loading || rolesLoading) return <EditorLoadingState />;
  if (!user) return <Navigate to="/auth" state={{ from: location }} replace />;
  if (!canManageWebsite) return <Navigate to="/" replace />;
  if (requireTrackingSettings && !canManageTrackingSettings) return <Navigate to="/editor" replace />;

  return <>{children}</>;
}
