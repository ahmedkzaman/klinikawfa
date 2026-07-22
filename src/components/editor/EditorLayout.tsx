import { Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { EditorDirtyNavigationProvider } from "@/components/editor/EditorDirtyNavigation";
import { EditorSidebar } from "@/components/editor/EditorSidebar";
import { EditorTopbar } from "@/components/editor/EditorTopbar";
import { useEditorDirtyNavigation } from "@/components/editor/useEditorDirtyNavigation";

export function EditorLayout() {
  return (
    <EditorDirtyNavigationProvider>
      <EditorLayoutContent />
    </EditorDirtyNavigationProvider>
  );
}

function EditorLayoutContent() {
  const { canManageTrackingSettings, signOut } = useAuth();
  const { confirmDeparture } = useEditorDirtyNavigation();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    if (!confirmDeparture()) return;
    await signOut();
    navigate("/auth");
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <EditorTopbar
        canManageTrackingSettings={canManageTrackingSettings}
        onSignOut={handleSignOut}
      />
      <div className="mx-auto flex w-full max-w-[100rem]">
        <aside className="sticky top-16 hidden h-[calc(100vh-4rem)] w-64 shrink-0 lg:block">
          <EditorSidebar canManageTrackingSettings={canManageTrackingSettings} />
        </aside>
        <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
