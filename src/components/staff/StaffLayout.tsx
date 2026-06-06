import { useState, useEffect, useRef } from 'react';
import { useNavigate, Link, useLocation, Outlet } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useOnboardingStatus } from '@/hooks/useOnboardingStatus';
import { OnboardingWizard } from './onboarding/OnboardingWizard';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  MapPin, Clock, History, Settings, LogOut, Menu, Home, Users, Map, CalendarDays, CalendarOff, Inbox, FileText,
  LayoutDashboard, CalendarCheck, Stethoscope, Image, Star, ChevronDown, ClipboardCheck, ClipboardList,
  User, BarChart3, CheckSquare, DollarSign, Megaphone, AlertTriangle, Activity, Globe
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { Loader2 } from 'lucide-react';
import logoKlinikAwfa from '@/assets/logo-klinik-awfa.png';

const staffNavItems = [
  { href: '/staff/dashboard', label: 'Dashboard', icon: Home },
  { href: '/staff/inbox', label: 'Inbox', icon: Inbox },
  { href: '/staff/punch', label: 'Punch In/Out', icon: MapPin },
  { href: '/staff/history', label: 'History', icon: History },
  { href: '/staff/calendar', label: 'Calendar', icon: CalendarDays },
  { href: '/staff/documents', label: 'Documents', icon: FileText },
  { href: '/staff/dr-roster', label: 'Dr Roster', icon: Stethoscope },
  { href: '/staff/staff-roster', label: 'Staff Roster', icon: Users },
  { href: '/staff/attendance-review', label: 'Attendance Review', icon: BarChart3 },
  { href: '/staff/profile', label: 'My Profile', icon: User },
  { href: '/staff/settings', label: 'Settings', icon: Settings },
];

const applicationsNavItems = [
  { href: '/staff/leave', label: 'Leave', icon: CalendarOff },
  { href: '/staff/appraisal', label: 'Performance Appraisal', icon: ClipboardCheck },
];

const adminNavItems = [
  { href: '/staff/admin', label: 'Admin Dashboard', icon: Settings },
  { href: '/staff/admin/appointments', label: 'Appointments', icon: CalendarCheck },
  { href: '/staff/admin/employees', label: 'Employees', icon: Users },
  { href: '/staff/admin/zones', label: 'Zones', icon: Map },
  { href: '/staff/admin/assignments', label: 'Assignments', icon: Clock },
  { href: '/staff/admin/requests', label: 'Requests', icon: Inbox },
  { href: '/staff/admin/roster', label: 'Roster', icon: CalendarDays },
  { href: '/staff/admin/onboarding', label: 'Onboarding', icon: ClipboardList },
  { href: '/staff/admin/attendance-review', label: 'Attendance Review', icon: BarChart3 },
  { href: '/staff/admin/profile-approvals', label: 'Profile Approvals', icon: CheckSquare },
  { href: '/staff/admin/payroll-summary', label: 'Payroll Summary', icon: LayoutDashboard },
  { href: '/staff/admin/payroll-profiles', label: 'Payroll Profiles', icon: DollarSign },
  { href: '/staff/admin/daily-tasks', label: 'Daily Tasks', icon: ClipboardList },
  { href: '/staff/admin/notices', label: 'Circular Notices', icon: Megaphone },
  { href: '/staff/admin/punch-settings', label: 'Punch Settings', icon: Clock },
  { href: '/staff/admin/landing-pages', label: 'Landing Pages', icon: Globe },
];

const contentNavItems = [
  { href: '/staff/website/leads', label: 'Leads / Appointments', icon: CalendarCheck },
  { href: '/staff/website/team', label: 'Team', icon: Stethoscope },
  
  { href: '/staff/website/blog', label: 'Blog Posts', icon: FileText },
  { href: '/staff/website/gallery', label: 'Gallery', icon: Image },
  { href: '/staff/website/reviews', label: 'Reviews', icon: Star },
  { href: '/staff/website/settings', label: 'Settings', icon: Settings },
];

function SidebarNav({ isAdmin, isOpsOrAdmin, pathname, onLinkClick, unreadNoticeCount }: { isAdmin: boolean; isOpsOrAdmin: boolean; pathname: string; onLinkClick?: () => void; unreadNoticeCount: number }) {
  const isActive = (href: string) => pathname === href;

  return (
    <nav className="flex flex-col flex-1 py-4">
      <div className="px-4 mb-2">
        <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Staff</span>
      </div>
      <div className="space-y-1 px-2">
        {staffNavItems.map((item) => (
          <Link
            key={item.href}
            to={item.href}
            onClick={onLinkClick}
            className={cn(
              'flex items-center gap-3 px-3 py-2 rounded-xl text-sm transition-colors',
              isActive(item.href)
                ? 'bg-blue-50 text-blue-700 font-medium'
                : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
            )}
          >
            <item.icon className="h-4 w-4" />
            {item.label}
            {item.href === '/staff/inbox' && unreadNoticeCount > 0 && (
              <span className="ml-auto inline-flex items-center justify-center rounded-full bg-rose-500 px-1.5 py-0.5 text-[10px] font-medium text-white">
                {unreadNoticeCount}
              </span>
            )}
          </Link>
        ))}
      </div>

      {/* Applications Section - Collapsible */}
      <div className="my-4 mx-4 border-t border-slate-100" />
      <Collapsible defaultOpen={applicationsNavItems.some(item => pathname.startsWith(item.href)) || pathname.startsWith('/clinic')}>
        <div className="px-4 mb-2 flex items-center justify-between">
          <CollapsibleTrigger className="flex items-center justify-between w-full group">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Applications</span>
            <ChevronDown className="h-3.5 w-3.5 text-slate-500 transition-transform group-data-[state=open]:rotate-180" />
          </CollapsibleTrigger>
        </div>
        <CollapsibleContent>
          <div className="space-y-1 px-2">
            {applicationsNavItems.map((item) => (
              <Link
                key={item.href}
                to={item.href}
                onClick={onLinkClick}
                className={cn(
                  'flex items-center gap-3 px-3 py-2 rounded-xl text-sm transition-colors',
                  isActive(item.href)
                    ? 'bg-blue-50 text-blue-700 font-medium'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                )}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            ))}
            {isOpsOrAdmin && (
              <Link
                to="/clinic/queue"
                onClick={onLinkClick}
                className={cn(
                  'flex items-center gap-3 px-3 py-2 rounded-xl text-sm transition-colors',
                  pathname.startsWith('/clinic')
                    ? 'bg-blue-50 text-blue-700 font-medium'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                )}
              >
                <Activity className="h-4 w-4" />
                Open Clinic Portal
              </Link>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>

      {isAdmin && (
        <>
          <div className="my-4 mx-4 border-t border-slate-100" />
          <div className="px-4 mb-2">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Admin</span>
          </div>
          <div className="space-y-1 px-2">
            {adminNavItems.map((item) => (
              <Link
                key={item.href}
                to={item.href}
                onClick={onLinkClick}
                className={cn(
                  'flex items-center gap-3 px-3 py-2 rounded-xl text-sm transition-colors',
                  isActive(item.href)
                    ? 'bg-blue-50 text-blue-700 font-medium'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
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
        <div className="my-4 mx-4 border-t border-slate-100" />
        <div className="px-4 mb-2">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Website</span>
        </div>
        <div className="space-y-1 px-2">
          {contentNavItems.map((item) => (
            <Link
              key={item.href}
              to={item.href}
              onClick={onLinkClick}
              className={cn(
                'flex items-center gap-3 px-3 py-2 rounded-xl text-sm transition-colors',
                isActive(item.href)
                  ? 'bg-blue-50 text-blue-700 font-medium'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
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
  const { user, loading, rolesLoading, isAdmin, isStaffOrAdmin, isOpsOrAdmin, isLocum, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { data: onboardingData, isLoading: onboardingLoading, isCompleted: onboardingCompleted, refetch: refetchOnboarding } = useOnboardingStatus(user?.id);

  // Circular notice blocking
  const [unacknowledgedNotices, setUnacknowledgedNotices] = useState<any[]>([]);
  const noticesLoadedRef = useRef(false);
  const [noticesLoading, setNoticesLoading] = useState(true);
  const [acknowledging, setAcknowledging] = useState(false);

  useEffect(() => {
    if (user && !isAdmin) fetchUnacknowledgedNotices();
    else if (!noticesLoadedRef.current) setNoticesLoading(false);
  }, [user, isAdmin]);

  useEffect(() => {
    if (!user || isAdmin) return;
    const channel = supabase
      .channel('notice-blocking')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'circular_notices' }, () => fetchUnacknowledgedNotices())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'circular_notice_acknowledgements' }, () => fetchUnacknowledgedNotices())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, isAdmin]);

  const fetchUnacknowledgedNotices = async () => {
    if (!user) return;
    const [noticesRes, acksRes] = await Promise.all([
      supabase.from('circular_notices').select('*').eq('is_active', true).order('published_at', { ascending: true }),
      supabase.from('circular_notice_acknowledgements').select('notice_id').eq('user_id', user.id),
    ]);
    const ackedIds = new Set((acksRes.data || []).map((a: any) => a.notice_id));
    const unacked = ((noticesRes.data as any[]) || []).filter((n: any) => !ackedIds.has(n.id));
    setUnacknowledgedNotices(unacked);
    noticesLoadedRef.current = true;
    setNoticesLoading(false);
  };

  const acknowledgeNotice = async (noticeId: string) => {
    setAcknowledging(true);
    await supabase.from('circular_notice_acknowledgements').insert({ notice_id: noticeId, user_id: user!.id });
    await fetchUnacknowledgedNotices();
    setAcknowledging(false);
  };

  if (loading || rolesLoading || onboardingLoading || noticesLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (!user) {
    navigate('/auth', { state: { from: location } });
    return null;
  }

  // Locums are independent contractors — bounce them to the clinic queue,
  // never let them touch HR-staff routes (onboarding, payroll, leave).
  if (isLocum) {
    navigate('/clinic/queue', { replace: true });
    return null;
  }

  if (!isStaffOrAdmin) {
    navigate('/');
    return null;
  }

  // Gate non-admin staff behind onboarding
  if (!isAdmin && !onboardingCompleted) {
    return (
      <div className="min-h-screen bg-slate-50">
        <OnboardingWizard
          userId={user.id}
          existingData={onboardingData || null}
          onComplete={() => refetchOnboarding()}
        />
      </div>
    );
  }

  // Block navigation if unacknowledged notices exist (non-admin)
  if (!isAdmin && unacknowledgedNotices.length > 0) {
    const notice = unacknowledgedNotices[0];
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="max-w-lg w-full">
          <div className="flex items-center gap-3 mb-4">
            <AlertTriangle className="h-6 w-6 text-amber-500" />
            <h1 className="text-xl font-bold text-slate-800">Important Notice</h1>
            {notice.priority === 'urgent' && (
              <span className="inline-flex items-center rounded-full bg-rose-500 px-2.5 py-0.5 text-xs font-medium text-white">Urgent</span>
            )}
          </div>
          <div className="bg-white rounded-2xl shadow-[0_4px_20px_rgb(0,0,0,0.03)] p-6 mb-4">
            <h2 className="text-lg font-semibold text-slate-800 mb-2">{notice.title}</h2>
            <p className="text-sm text-slate-600 whitespace-pre-wrap">{notice.content}</p>
          </div>
          <p className="text-xs text-slate-500 mb-4">
            {unacknowledgedNotices.length > 1 && `${unacknowledgedNotices.length - 1} more notice(s) remaining after this.`}
          </p>
          <Button className="w-full rounded-xl bg-blue-600 hover:bg-blue-700 text-white" size="lg" disabled={acknowledging} onClick={() => acknowledgeNotice(notice.id)}>
            <CheckSquare className="h-4 w-4 mr-2" />
            I've read &amp; understood this notice/announcement
          </Button>
        </div>
      </div>
    );
  }

  const handleSignOut = async () => {
    await signOut();
    navigate('/auth');
  };

  return (
    <div className="min-h-screen flex w-full bg-slate-50">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex flex-col w-60 border-r border-slate-100 bg-white min-h-screen sticky top-0 h-screen">
        <div className="px-4 py-4 border-b border-slate-100">
          <Link to="/staff/dashboard" className="flex items-center gap-2">
            <img src={logoKlinikAwfa} alt="Klinik Awfa" className="h-8 w-auto" />
            <span className="font-semibold text-sm text-slate-800">Klinik Awfa Staff</span>
          </Link>
          {isOpsOrAdmin && (
            <Button asChild size="sm" className="w-full mt-3 gap-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white">
              <Link to="/clinic/queue">
                <Activity className="h-4 w-4" />
                Open Clinic System
              </Link>
            </Button>
          )}
        </div>
        <div className="flex-1 overflow-y-auto">
          <SidebarNav isAdmin={isAdmin} isOpsOrAdmin={isOpsOrAdmin} pathname={location.pathname} unreadNoticeCount={unacknowledgedNotices.length} />
        </div>
        <div className="shrink-0 p-4 border-t border-slate-100">
          <div className="text-sm text-slate-500 mb-2 truncate">{user.email}</div>
          <Button variant="ghost" size="sm" className="w-full justify-start text-slate-600 hover:bg-slate-50 hover:text-slate-900" onClick={handleSignOut}>
            <LogOut className="h-4 w-4 mr-2" />
            Sign Out
          </Button>
        </div>
      </aside>

      {/* Mobile Sidebar */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-60 p-0 bg-white flex flex-col h-full">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <div className="shrink-0 px-4 py-4 border-b border-slate-100">
            <Link to="/staff/dashboard" className="flex items-center gap-2" onClick={() => setMobileOpen(false)}>
              <img src={logoKlinikAwfa} alt="Klinik Awfa" className="h-8 w-auto" />
              <span className="font-semibold text-sm text-slate-800">Klinik Awfa Staff</span>
            </Link>
            {isOpsOrAdmin && (
              <Button asChild size="sm" className="w-full mt-3 gap-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white" onClick={() => setMobileOpen(false)}>
                <Link to="/clinic/queue">
                  <Activity className="h-4 w-4" />
                  Open Clinic System
                </Link>
              </Button>
            )}
          </div>
          <div className="flex-1 overflow-y-auto">
            <SidebarNav isAdmin={isAdmin} isOpsOrAdmin={isOpsOrAdmin} pathname={location.pathname} onLinkClick={() => setMobileOpen(false)} unreadNoticeCount={unacknowledgedNotices.length} />
          </div>
          <div className="shrink-0 p-4 border-t border-slate-100">
            <div className="text-sm text-slate-500 mb-2 truncate">{user.email}</div>
            <Button variant="ghost" size="sm" className="w-full justify-start text-slate-600 hover:bg-slate-50 hover:text-slate-900" onClick={handleSignOut}>
              <LogOut className="h-4 w-4 mr-2" />
              Sign Out
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* Main content */}
      <div className="flex-1 flex flex-col h-screen overflow-y-auto bg-slate-50">
        <header className="sticky top-0 z-40 h-12 flex items-center border-b border-slate-100 bg-white/90 backdrop-blur px-4 md:px-6">
          <Button variant="ghost" size="icon" className="md:hidden mr-2 text-slate-600 hover:bg-slate-50" onClick={() => setMobileOpen(true)}>
            <Menu className="h-5 w-5" />
          </Button>
          <span className="ml-auto text-sm text-slate-500 hidden sm:inline">{user.email}</span>
        </header>
        <main className="flex-1">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
