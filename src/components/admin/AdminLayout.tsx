import { Outlet } from 'react-router-dom';
import { SidebarProvider, SidebarTrigger, SidebarInset } from '@/components/ui/sidebar';
import { AdminSidebar } from './AdminSidebar';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { useLanguage } from '@/contexts/LanguageContext';
import { Separator } from '@/components/ui/separator';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { useLocation } from 'react-router-dom';

const breadcrumbMap: Record<string, { ms: string; en: string }> = {
  '/admin': { ms: 'Dashboard', en: 'Dashboard' },
  '/admin/leads': { ms: 'Leads', en: 'Leads' },
  '/admin/blog': { ms: 'Blog', en: 'Blog' },
  '/admin/blog/new': { ms: 'Post Baru', en: 'New Post' },
  '/admin/gallery': { ms: 'Galeri', en: 'Gallery' },
  '/admin/users': { ms: 'Pengguna', en: 'Users' },
};

export function AdminLayout() {
  const { language } = useLanguage();
  const location = useLocation();

  const getBreadcrumb = () => {
    const path = location.pathname;
    const crumb = breadcrumbMap[path];
    if (crumb) {
      return language === 'ms' ? crumb.ms : crumb.en;
    }
    // Handle dynamic routes like /admin/blog/:id
    if (path.startsWith('/admin/blog/') && path !== '/admin/blog/new') {
      return language === 'ms' ? 'Edit Post' : 'Edit Post';
    }
    if (path.startsWith('/admin/leads/')) {
      return language === 'ms' ? 'Detail Lead' : 'Lead Detail';
    }
    return 'Admin';
  };

  return (
    <ProtectedRoute requireStaffOrAdmin>
      <SidebarProvider>
        <div className="flex min-h-screen w-full">
          <AdminSidebar />
          <SidebarInset className="flex-1">
            <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-4">
              <SidebarTrigger className="-ml-1" />
              <Separator orientation="vertical" className="mr-2 h-4" />
              <Breadcrumb>
                <BreadcrumbList>
                  <BreadcrumbItem className="hidden md:block">
                    <BreadcrumbLink href="/admin">
                      {language === 'ms' ? 'Admin' : 'Admin'}
                    </BreadcrumbLink>
                  </BreadcrumbItem>
                  <BreadcrumbSeparator className="hidden md:block" />
                  <BreadcrumbItem>
                    <BreadcrumbPage>{getBreadcrumb()}</BreadcrumbPage>
                  </BreadcrumbItem>
                </BreadcrumbList>
              </Breadcrumb>
            </header>
            <main className="flex-1 p-4 md:p-6">
              <Outlet />
            </main>
          </SidebarInset>
        </div>
      </SidebarProvider>
    </ProtectedRoute>
  );
}
