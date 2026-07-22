import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  FileText,
  GalleryHorizontal,
  Home,
  Images,
  LayoutDashboard,
  Network,
  PanelTop,
  Star,
  Stethoscope,
  UserRound,
  Users,
} from "lucide-react";
import { NavLink } from "react-router-dom";

import { cn } from "@/lib/utils";

interface EditorNavigationItem {
  readonly to: string;
  readonly label: string;
  readonly icon: LucideIcon;
  readonly end?: boolean;
  readonly requiresTrackingAccess?: boolean;
}

interface EditorNavigationGroup {
  readonly label: string;
  readonly items: readonly EditorNavigationItem[];
}

export const editorNavigationGroups: readonly EditorNavigationGroup[] = [
  {
    label: "Overview",
    items: [
      { to: "/editor", label: "Dashboard", icon: LayoutDashboard, end: true },
    ],
  },
  {
    label: "Content",
    items: [
      { to: "/editor/pages", label: "Pages", icon: PanelTop },
      { to: "/editor/posts", label: "Posts", icon: FileText },
      { to: "/editor/media", label: "Media", icon: Images },
    ],
  },
  {
    label: "Website Content",
    items: [
      { to: "/editor/services", label: "Services", icon: Stethoscope },
      { to: "/editor/team", label: "Team", icon: Users },
      { to: "/editor/gallery", label: "Gallery", icon: GalleryHorizontal },
      { to: "/editor/reviews", label: "Reviews", icon: Star },
    ],
  },
  {
    label: "Appearance",
    items: [
      { to: "/editor/home", label: "Home", icon: Home },
      { to: "/editor/navigation", label: "Navigation", icon: Network },
    ],
  },
  {
    label: "Marketing",
    items: [
      {
        to: "/editor/analytics",
        label: "Analytics & Consent",
        icon: BarChart3,
        requiresTrackingAccess: true,
      },
    ],
  },
  {
    label: "Account",
    items: [{ to: "/editor/profile", label: "My profile", icon: UserRound }],
  },
] as const;

export function EditorSidebar({
  canManageTrackingSettings,
  onNavigate,
  className,
}: {
  canManageTrackingSettings: boolean;
  onNavigate?: () => void;
  className?: string;
}) {
  return (
    <nav
      aria-label="Website editor"
      className={cn(
        "h-full overflow-y-auto bg-slate-950 px-3 py-5 text-slate-200",
        className,
      )}
    >
      <div className="space-y-6">
        {editorNavigationGroups.map((group) => {
          const items = group.items.filter(
            (item) =>
              !item.requiresTrackingAccess || canManageTrackingSettings,
          );
          if (items.length === 0) return null;

          return (
            <section key={group.label} aria-labelledby={`editor-nav-${group.label}`}>
              <h2
                id={`editor-nav-${group.label}`}
                className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500"
              >
                {group.label}
              </h2>
              <div className="space-y-1">
                {items.map((item) => (
                  <EditorSidebarLink
                    key={item.to}
                    item={item}
                    onNavigate={onNavigate}
                  />
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </nav>
  );
}

function EditorSidebarLink({
  item,
  onNavigate,
}: {
  item: EditorNavigationItem;
  onNavigate?: () => void;
}) {
  const Icon = item.icon;
  return (
    <NavLink
      to={item.to}
      end={item.end}
      onClick={onNavigate}
      className={({ isActive }) =>
        cn(
          "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400",
          isActive
            ? "bg-blue-600 font-medium text-white shadow-sm"
            : "text-slate-300 hover:bg-slate-900 hover:text-white",
        )
      }
    >
      <Icon className="h-4 w-4" aria-hidden="true" />
      <span>{item.label}</span>
    </NavLink>
  );
}
