import { useState } from 'react';
import { useNavigate, Link, useLocation, Outlet } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import {
  MapPin, Clock, History, Settings, LogOut, Menu, Home, Users, Map, CalendarDays, CalendarOff, Inbox, FileText,
  LayoutDashboard, CalendarCheck, Stethoscope, Video, Image, Star
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Loader2 } from 'lucide-react';
import logoKlinikAwfa from '@/assets/logo-klinik-awfa.png';

const staffNavItems = [
  { href: '/staff/dashboard', label: 'Dashboard', icon: Home },
  { href: '/staff/punch', label: 'Punch In/Out', icon: MapPin },
  { href: '/staff/history', label: 'History', icon: History },
  { href: '/staff/calendar', label: 'Calendar', icon: CalendarDays },
  { href: '/staff/leave', label: 'Leave', icon: CalendarOff },
  { href: '/staff/documents', label: 'Documents', icon: FileText },
];

const adminNavItems = [
  { href: '/staff/admin', label: 'Admin Dashboard', icon: Settings },
  { href: '/staff/admin/employees', label: 'Employees', icon: Users },
  { href: '/staff/admin/zones', label: 'Zones', icon: Map },
  { href: '/staff/admin/assignments', label: 'Assignments', icon: Clock },
  { href: '/staff/admin/requests', label: 'Requests', icon: Inbox },
];

const contentNavItems = [
  { href: '/admin/leads', label: 'Leads / Appointments', icon: CalendarCheck },
  { href: '/admin/leads', label: 'Leads / Appointments', icon: CalendarCheck },
  { href: '/admin/team', label: 'Team', icon: Stethoscope },
  { href: '/admin/video-calls', label: 'Video Calls', icon: Video },
  { href: '/admin/blog', label: 'Blog Posts', icon: FileText },
  { href: '/admin/gallery', label: 'Gallery', icon: Image },
  { href: '/admin/reviews', label: 'Reviews', icon: Star },
  { href: '/admin/settings', label: 'Settings', icon: Settings },
];

function SidebarNav({ isAdmin, pathname, onLinkClick }: { isAdmin: boolean; pathname: string; onLinkClick?: () => void }) {
  const isActive = (href: string) => pathname === href;

  return (
    <nav className="flex flex-col flex-1 py-4">
      <div className="px-4 mb-2">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Staff</span>
      </div>
      <div className="space-y-1 px-2">
        {staffNavItems.map((item) => (
          <Link
            key={item.href}
            to={item.href}
            onClick={onLinkClick}
            className={cn(
              'flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors',
              isActive(item.href)
                ? 'bg-primary/10 text-primary font-medium'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted'
            )}
          >
            <item.icon className="h-4 w-4" />
            {item.label}
          </Link>
        ))}
      </div>

      {isAdmin && (
        <>
          <div className="my-4 mx-4 border-t" />
          <div className="px-4 mb-2">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Admin</span>
          </div>
          <div className="space-y-1 px-2">
            {adminNavItems.map((item) => (
              <Link
                key={item.href}
                to={item.href}
                onClick={onLinkClick}
                className={cn(
                  'flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors',
                  isActive(item.href)
                    ? 'bg-primary/10 text-primary font-medium'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                )}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            ))}
          </div>
        </>
      )}

      {/* Content Management - All Staff */}
      <>
        <div className="my-4 mx-4 border-t" />
        <div className="px-4 mb-2">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Website</span>
        </div>
        <div className="space-y-1 px-2">
          {contentNavItems.map((item) => (
            <Link
              key={item.href}
              to={item.href}
              onClick={onLinkClick}
              className={cn(
                'flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors',
                isActive(item.href)
                  ? 'bg-primary/10 text-primary font-medium'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted'
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          ))}
        </div>
      </>
    </nav>
  );
}

export function StaffLayout() {
  const { user, loading, rolesLoading, isAdmin, isStaffOrAdmin, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  if (loading || rolesLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    navigate('/auth', { state: { from: location } });
    return null;
  }

  if (!isStaffOrAdmin) {
    navigate('/');
    return null;
  }

  const handleSignOut = async () => {
    await signOut();
    navigate('/auth');
  };

  return (
    <div className="min-h-screen flex w-full bg-background">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex flex-col w-60 border-r bg-background min-h-screen sticky top-0 h-screen">
        <div className="px-4 py-4 border-b">
          <Link to="/staff/dashboard" className="flex items-center gap-2">
            <img src={logoKlinikAwfa} alt="Klinik Awfa" className="h-8 w-auto" />
            <span className="font-semibold text-sm text-primary">Klinik Awfa Staff</span>
          </Link>
        </div>
        <SidebarNav isAdmin={isAdmin} pathname={location.pathname} />
        <div className="mt-auto p-4 border-t">
          <div className="text-sm text-muted-foreground mb-2 truncate">{user.email}</div>
          <Button variant="ghost" size="sm" className="w-full justify-start" onClick={handleSignOut}>
            <LogOut className="h-4 w-4 mr-2" />
            Sign Out
          </Button>
        </div>
      </aside>

      {/* Mobile Sidebar */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-60 p-0">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <div className="px-4 py-4 border-b">
            <Link to="/staff/dashboard" className="flex items-center gap-2" onClick={() => setMobileOpen(false)}>
              <img src={logoKlinikAwfa} alt="Klinik Awfa" className="h-8 w-auto" />
              <span className="font-semibold text-sm">Klinik Awfa Staff</span>
            </Link>
          </div>
          <SidebarNav isAdmin={isAdmin} pathname={location.pathname} onLinkClick={() => setMobileOpen(false)} />
          <div className="mt-auto p-4 border-t">
            <div className="text-sm text-muted-foreground mb-2 truncate">{user.email}</div>
            <Button variant="ghost" size="sm" className="w-full justify-start" onClick={handleSignOut}>
              <LogOut className="h-4 w-4 mr-2" />
              Sign Out
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-h-screen">
        <header className="sticky top-0 z-40 h-12 flex items-center border-b bg-background/95 backdrop-blur px-4 md:px-6">
          <Button variant="ghost" size="icon" className="md:hidden mr-2" onClick={() => setMobileOpen(true)}>
            <Menu className="h-5 w-5" />
          </Button>
          <span className="ml-auto text-sm text-muted-foreground hidden sm:inline">{user.email}</span>
        </header>
        <main className="flex-1 container py-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
