import { useState } from 'react';
import { Link, useLocation, Outlet } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import {
  ListOrdered,
  Users,
  Stethoscope,
  Receipt,
  ClipboardList,
  Package,
  Archive,
  ArrowLeft,
  Menu,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import logoKlinikAwfa from '@/assets/logo-klinik-awfa.png';

type ClinicNavItem = {
  href: string;
  label: string;
  icon: typeof ListOrdered;
  specialAdminOnly?: boolean;
};

const clinicNavItems: ClinicNavItem[] = [
  { href: '/clinic/queue', label: 'Queue Board', icon: ListOrdered },
  { href: '/clinic/patients', label: 'Patients', icon: Users },
  { href: '/clinic/consultation', label: 'Consultation', icon: Stethoscope },
  { href: '/clinic/billings', label: 'Billings', icon: Receipt },
  { href: '/clinic/procurement', label: 'Procurement', icon: ClipboardList },
  { href: '/clinic/inventory', label: 'Inventory', icon: Package },
  { href: '/clinic/voided', label: 'Voided Records', icon: Archive, specialAdminOnly: true },
];

function SidebarNav({
  pathname,
  isSpecialAdmin,
  onLinkClick,
}: {
  pathname: string;
  isSpecialAdmin: boolean;
  onLinkClick?: () => void;
}) {
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  const visibleItems = clinicNavItems.filter((item) => !item.specialAdminOnly || isSpecialAdmin);

  return (
    <nav className="flex flex-col flex-1 py-4">
      <div className="px-4 mb-2">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Clinic
        </span>
      </div>
      <div className="space-y-1 px-2">
        {visibleItems.map((item) => (
          <Link
            key={item.href}
            to={item.href}
            onClick={onLinkClick}
            className={cn(
              'flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors',
              isActive(item.href)
                ? 'bg-primary/10 text-primary font-medium'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted',
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
  const { user, isSpecialAdmin } = useAuth();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="min-h-screen flex w-full bg-background">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex flex-col w-60 border-r bg-background min-h-screen sticky top-0 h-screen">
        <div className="px-4 py-4 border-b">
          <Link to="/clinic/queue" className="flex items-center gap-2">
            <img src={logoKlinikAwfa} alt="Klinik Awfa" className="h-8 w-auto" />
            <span className="font-semibold text-sm text-primary">Klinik Awfa Clinic</span>
          </Link>
        </div>
        <div className="flex-1 overflow-y-auto">
          <SidebarNav pathname={location.pathname} isSpecialAdmin={isSpecialAdmin} />
        </div>
        <div className="shrink-0 p-4 border-t">
          {user?.email && (
            <div className="text-sm text-muted-foreground mb-2 truncate">{user.email}</div>
          )}
          <Button variant="ghost" size="sm" className="w-full justify-start" asChild>
            <Link to="/staff/dashboard">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Staff Portal
            </Link>
          </Button>
        </div>
      </aside>

      {/* Mobile Sidebar */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-60 p-0">
          <SheetTitle className="sr-only">Clinic Navigation</SheetTitle>
          <div className="px-4 py-4 border-b">
            <Link
              to="/clinic/queue"
              className="flex items-center gap-2"
              onClick={() => setMobileOpen(false)}
            >
              <img src={logoKlinikAwfa} alt="Klinik Awfa" className="h-8 w-auto" />
              <span className="font-semibold text-sm">Klinik Awfa Clinic</span>
            </Link>
          </div>
          <div className="flex-1 overflow-y-auto">
            <SidebarNav
              pathname={location.pathname}
              isSpecialAdmin={isSpecialAdmin}
              onLinkClick={() => setMobileOpen(false)}
            />
          </div>
          <div className="shrink-0 p-4 border-t">
            {user?.email && (
              <div className="text-sm text-muted-foreground mb-2 truncate">{user.email}</div>
            )}
            <Button variant="ghost" size="sm" className="w-full justify-start" asChild>
              <Link to="/staff/dashboard" onClick={() => setMobileOpen(false)}>
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Staff Portal
              </Link>
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* Main content */}
      <div className="flex-1 flex flex-col h-screen overflow-y-auto">
        <header className="sticky top-0 z-40 h-12 flex items-center border-b bg-background/95 backdrop-blur px-4 md:px-6">
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden mr-2"
            onClick={() => setMobileOpen(true)}
            aria-label="Open clinic navigation"
          >
            <Menu className="h-5 w-5" />
          </Button>
          <span className="text-sm font-medium text-foreground">Clinic Portal</span>
          {user?.email && (
            <span className="ml-auto text-sm text-muted-foreground hidden sm:inline">
              {user.email}
            </span>
          )}
        </header>
        <main className="flex-1 container py-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
