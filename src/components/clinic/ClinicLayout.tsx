import { useState } from 'react';
import { Link, useLocation, Outlet } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import {
  Users,
  Stethoscope,
  Receipt,
  FileText,
  Pill,
  ArrowLeft,
  Menu,
  Settings,
  LineChart,
  Briefcase,
  CalendarDays,
  LayoutDashboard,
  PackageSearch,
  ShoppingCart,
  Trash2,
  PackageX,
  ClipboardList,
  Activity,
  TrendingUp,
  Video,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import logoKlinikAwfa from '@/assets/logo-klinik-awfa.png';
import { StaffChat } from '@/components/staff/chat/StaffChat';

type ClinicNavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  specialAdminOnly?: boolean;
  adminOnly?: boolean;
  locumAllowed?: boolean;
};

const clinicNavItems: ClinicNavItem[] = [
  { href: '/clinic/patients', label: 'Patients', icon: Users },
  { href: '/clinic/appointments', label: 'Appointments', icon: CalendarDays, locumAllowed: true },
  { href: '/clinic/video-calls', label: 'Video Calls', icon: Video },
  { href: '/clinic/queue', label: 'Queue Board', icon: LayoutDashboard, locumAllowed: true },
  { href: '/clinic/consultation', label: 'Consultation', icon: Stethoscope, locumAllowed: true },
  { href: '/clinic/dispensary', label: 'Dispensary', icon: Pill },
  { href: '/clinic/billings', label: 'Billings', icon: Receipt },
  { href: '/clinic/inventory', label: 'Inventory', icon: PackageSearch },
  { href: '/clinic/inventory/restock-review', label: 'Restock Requests', icon: ClipboardList },
  { href: '/clinic/owe-slips', label: 'Owe Slips', icon: PackageX },
  { href: '/clinic/panel-claims', label: 'Panel Claims', icon: FileText },
  { href: '/clinic/receivables', label: 'Receivables', icon: Briefcase },
  { href: '/clinic/procurement', label: 'Procurement', icon: ShoppingCart },
  { href: '/clinic/procurement-dashboard', label: 'Procurement Dashboard', icon: Activity },
  { href: '/clinic/seasonal-forecast', label: 'Seasonal Forecast', icon: TrendingUp, adminOnly: true },
  { href: '/clinic/voided', label: 'Voided Records', icon: Trash2, specialAdminOnly: true },
  { href: '/clinic/insight', label: 'Insight', icon: LineChart, adminOnly: true },
  { href: '/clinic/settings', label: 'Settings', icon: Settings },
];

function SidebarNav({
  pathname,
  isSpecialAdmin,
  isAdmin,
  isLocum,
  onLinkClick,
}: {
  pathname: string;
  isSpecialAdmin: boolean;
  isAdmin: boolean;
  isLocum: boolean;
  onLinkClick?: () => void;
}) {
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  const visibleItems = clinicNavItems.filter((item) => {
    if (isLocum) return !!item.locumAllowed;
    if (item.specialAdminOnly && !isSpecialAdmin) return false;
    if (item.adminOnly && !(isAdmin || isSpecialAdmin)) return false;
    return true;
  });

  return (
    <nav className="flex flex-col flex-1 py-4">
      <div className="px-4 mb-3">
        <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Clinic</span>
      </div>
      <div className="space-y-1 px-2">
        {visibleItems.map((item) => (
          <Link
            key={item.href}
            to={item.href}
            onClick={onLinkClick}
            className={cn(
              'flex items-center gap-3 px-3 py-2 rounded-xl text-sm transition-colors',
              isActive(item.href)
                ? 'bg-blue-600 text-white font-medium shadow-[0_4px_20px_rgb(37,99,235,0.25)]'
                : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50',
            )}
          >
            <item.icon className="h-4 w-4" />
            {item.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}

export function ClinicLayout() {
  const { user, isSpecialAdmin, isAdmin, isLocum, signOut } = useAuth();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="min-h-screen flex w-full bg-slate-50">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex flex-col w-60 bg-white border-r border-slate-100 min-h-screen sticky top-0 h-screen">
        <div className="px-4 py-4 border-b border-slate-100">
          <Link to="/clinic/queue" className="flex items-center gap-2">
            <img src={logoKlinikAwfa} alt="Klinik Awfa" className="h-8 w-auto" />
            <span className="font-semibold text-sm text-slate-800">Klinik Awfa Clinic</span>
          </Link>
        </div>
        <div className="flex-1 overflow-y-auto">
          <SidebarNav
            pathname={location.pathname}
            isSpecialAdmin={isSpecialAdmin}
            isAdmin={isAdmin}
            isLocum={isLocum}
          />
        </div>
        <div className="shrink-0 p-4 border-t border-slate-100">
          {user?.email && (
            <div className="text-xs text-slate-500 mb-2 truncate">{user.email}</div>
          )}
          {isLocum ? (
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start rounded-xl text-slate-600 hover:text-slate-800 hover:bg-slate-50"
              onClick={() => signOut()}
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Sign Out
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start rounded-xl text-slate-600 hover:text-slate-800 hover:bg-slate-50"
              asChild
            >
              <Link to="/staff/dashboard">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Staff Portal
              </Link>
            </Button>
          )}
        </div>
      </aside>

      {/* Mobile Sidebar */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-60 p-0 bg-white">
          <SheetTitle className="sr-only">Clinic Navigation</SheetTitle>
          <div className="px-4 py-4 border-b border-slate-100">
            <Link
              to="/clinic/queue"
              className="flex items-center gap-2"
              onClick={() => setMobileOpen(false)}
            >
              <img src={logoKlinikAwfa} alt="Klinik Awfa" className="h-8 w-auto" />
              <span className="font-semibold text-sm text-slate-800">Klinik Awfa Clinic</span>
            </Link>
          </div>
          <div className="flex-1 overflow-y-auto">
            <SidebarNav
              pathname={location.pathname}
              isSpecialAdmin={isSpecialAdmin}
              isAdmin={isAdmin}
              isLocum={isLocum}
              onLinkClick={() => setMobileOpen(false)}
            />
          </div>
          <div className="shrink-0 p-4 border-t border-slate-100">
            {user?.email && (
              <div className="text-xs text-slate-500 mb-2 truncate">{user.email}</div>
            )}
            {isLocum ? (
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-start rounded-xl text-slate-600 hover:text-slate-800 hover:bg-slate-50"
                onClick={() => {
                  setMobileOpen(false);
                  signOut();
                }}
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Sign Out
              </Button>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-start rounded-xl text-slate-600 hover:text-slate-800 hover:bg-slate-50"
                asChild
              >
                <Link to="/staff/dashboard" onClick={() => setMobileOpen(false)}>
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back to Staff Portal
                </Link>
              </Button>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* Main content */}
      <div className="flex-1 flex flex-col h-screen overflow-y-auto">
        <header className="sticky top-0 z-40 h-12 flex items-center bg-white/95 backdrop-blur border-b border-slate-100 px-4 md:px-6">
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden mr-2 rounded-lg"
            onClick={() => setMobileOpen(true)}
            aria-label="Open clinic navigation"
          >
            <Menu className="h-5 w-5" />
          </Button>
          <span className="text-sm font-semibold text-slate-800">Clinic Portal</span>
          {user?.email && (
            <span className="ml-auto text-xs text-slate-500 hidden sm:inline">{user.email}</span>
          )}
        </header>
        <main className="flex-1 container py-6">
          <Outlet />
        </main>
      </div>
      <StaffChat />
    </div>
  );
}
