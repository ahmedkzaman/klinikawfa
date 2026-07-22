import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import {
  BarChart3,
  FileText,
  GalleryHorizontal,
  Home,
  Menu,
  Network,
  PanelTop,
  LayoutDashboard,
  ShieldCheck,
  Star,
  Stethoscope,
  UserRound,
  Wrench,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { EditorDirtyNavigationProvider } from "@/components/editor/EditorDirtyNavigation";
import { useEditorDirtyNavigation } from "@/components/editor/useEditorDirtyNavigation";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const editorNavItems = [
  { to: "/editor", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/editor/home", label: "Home", icon: Home },
  { to: "/editor/pages", label: "Pages", icon: PanelTop },
  { to: "/editor/services", label: "Services", icon: Wrench },
  { to: "/editor/team", label: "Team", icon: Stethoscope },
  { to: "/editor/blog", label: "Blog", icon: FileText },
  { to: "/editor/gallery", label: "Gallery", icon: GalleryHorizontal },
  { to: "/editor/reviews", label: "Reviews", icon: Star },
  { to: "/editor/navigation", label: "Navigation", icon: Network },
  { to: "/editor/profile", label: "My profile", icon: UserRound },
];

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
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 sm:px-6 lg:px-8">
          <Link to="/editor" className="flex min-w-0 items-center gap-3 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600 text-white">
              <ShieldCheck className="h-5 w-5" aria-hidden="true" />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold">Klinik Awfa</span>
              <span className="block text-xs text-slate-500">Website Editor</span>
            </span>
          </Link>
          <Button variant="outline" size="sm" className="ml-auto" onClick={handleSignOut}>
            Sign out
          </Button>
        </div>
      </header>

      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:flex-row lg:px-8">
        <aside className="lg:w-56 lg:shrink-0">
          <nav aria-label="Website editor" className="rounded-xl border border-slate-200 bg-white p-2 shadow-sm">
            <div className="flex items-center gap-2 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <Menu className="h-4 w-4" aria-hidden="true" />
              Website
            </div>
            <div className="space-y-1">
              {editorNavItems.map((item) => (
                <EditorNavLink key={item.to} {...item} />
              ))}
              {canManageTrackingSettings && (
                <EditorNavLink to="/editor/analytics" label="Analytics & Consent" icon={BarChart3} />
              )}
            </div>
          </nav>
        </aside>
        <main className="min-w-0 flex-1">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

function EditorNavLink({
  to,
  label,
  icon: Icon,
  end,
}: {
  to: string;
  label: string;
  icon: typeof Home;
  end?: boolean;
}) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        cn(
          "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-1",
          isActive
            ? "bg-blue-50 font-medium text-blue-700"
            : "text-slate-600 hover:bg-slate-50 hover:text-slate-900",
        )
      }
    >
      <Icon className="h-4 w-4" aria-hidden="true" />
      {label}
    </NavLink>
  );
}
