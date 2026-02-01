import { useLocation } from 'react-router-dom';
import { 
  LayoutDashboard, 
  CalendarCheck, 
  FileText, 
  Image, 
  Users,
  LogOut,
  Home,
  Stethoscope
} from 'lucide-react';
import { NavLink } from '@/components/NavLink';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
  useSidebar,
} from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';

const menuItems = [
  { 
    titleMs: 'Dashboard', 
    titleEn: 'Dashboard', 
    url: '/admin', 
    icon: LayoutDashboard,
    staffAccess: true 
  },
  { 
    titleMs: 'Leads / Temujanji', 
    titleEn: 'Leads / Appointments', 
    url: '/admin/leads', 
    icon: CalendarCheck,
    staffAccess: true 
  },
  { 
    titleMs: 'Pasukan', 
    titleEn: 'Team', 
    url: '/admin/team', 
    icon: Stethoscope,
    staffAccess: true 
  },
  { 
    titleMs: 'Blog Posts', 
    titleEn: 'Blog Posts', 
    url: '/admin/blog', 
    icon: FileText,
    staffAccess: true 
  },
  { 
    titleMs: 'Galeri', 
    titleEn: 'Gallery', 
    url: '/admin/gallery', 
    icon: Image,
    staffAccess: true 
  },
  { 
    titleMs: 'Pengguna', 
    titleEn: 'Users', 
    url: '/admin/users', 
    icon: Users,
    staffAccess: false // Admin only
  },
];

export function AdminSidebar() {
  const { state } = useSidebar();
  const collapsed = state === 'collapsed';
  const location = useLocation();
  const { language } = useLanguage();
  const { signOut, isAdmin, user } = useAuth();

  const isActive = (path: string) => {
    if (path === '/admin') {
      return location.pathname === '/admin';
    }
    return location.pathname.startsWith(path);
  };

  const filteredItems = menuItems.filter(item => item.staffAccess || isAdmin);

  return (
    <Sidebar collapsible="icon" className="border-r border-border">
      <SidebarContent>
        {/* Logo / Brand */}
        <div className="flex h-14 items-center border-b border-border px-4">
          {!collapsed && (
            <span className="font-semibold text-primary">
              {language === 'ms' ? 'Panel Admin' : 'Admin Panel'}
            </span>
          )}
        </div>

        <SidebarGroup>
          <SidebarGroupLabel>
            {language === 'ms' ? 'Menu' : 'Menu'}
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {filteredItems.map((item) => (
                <SidebarMenuItem key={item.url}>
                  <SidebarMenuButton 
                    asChild 
                    isActive={isActive(item.url)}
                    tooltip={collapsed ? (language === 'ms' ? item.titleMs : item.titleEn) : undefined}
                  >
                    <NavLink 
                      to={item.url} 
                      end={item.url === '/admin'}
                      className="flex items-center gap-3"
                      activeClassName="bg-primary/10 text-primary font-medium"
                    >
                      <item.icon className="h-4 w-4 shrink-0" />
                      {!collapsed && (
                        <span>{language === 'ms' ? item.titleMs : item.titleEn}</span>
                      )}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <Separator className="my-2" />

        {/* Back to site */}
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton 
                  asChild
                  tooltip={collapsed ? (language === 'ms' ? 'Kembali ke Laman' : 'Back to Site') : undefined}
                >
                  <NavLink to="/" className="flex items-center gap-3">
                    <Home className="h-4 w-4 shrink-0" />
                    {!collapsed && (
                      <span>{language === 'ms' ? 'Kembali ke Laman' : 'Back to Site'}</span>
                    )}
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-border p-4">
        {!collapsed && user && (
          <div className="mb-3 text-sm text-muted-foreground truncate">
            {user.email}
          </div>
        )}
        <Button 
          variant="outline" 
          size={collapsed ? 'icon' : 'default'}
          onClick={signOut}
          className="w-full"
        >
          <LogOut className="h-4 w-4" />
          {!collapsed && (
            <span className="ml-2">{language === 'ms' ? 'Log Keluar' : 'Logout'}</span>
          )}
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}
