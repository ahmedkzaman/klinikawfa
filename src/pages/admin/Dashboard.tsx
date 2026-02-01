import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { CalendarCheck, FileText, Image, Users, TrendingUp, Clock } from 'lucide-react';
import { Link } from 'react-router-dom';

interface DashboardStats {
  totalLeads: number;
  pendingLeads: number;
  totalPosts: number;
  publishedPosts: number;
  totalImages: number;
  totalUsers: number;
}

export default function AdminDashboard() {
  const { language } = useLanguage();
  const { isAdmin } = useAuth();
  const [stats, setStats] = useState<DashboardStats>({
    totalLeads: 0,
    pendingLeads: 0,
    totalPosts: 0,
    publishedPosts: 0,
    totalImages: 0,
    totalUsers: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        // Fetch leads count
        const { count: totalLeads } = await supabase
          .from('appointments')
          .select('*', { count: 'exact', head: true });

        const { count: pendingLeads } = await supabase
          .from('appointments')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'pending');

        // Fetch posts count
        const { count: totalPosts } = await supabase
          .from('blog_posts')
          .select('*', { count: 'exact', head: true });

        const { count: publishedPosts } = await supabase
          .from('blog_posts')
          .select('*', { count: 'exact', head: true })
          .eq('published', true);

        // Fetch gallery count
        const { count: totalImages } = await supabase
          .from('gallery_images')
          .select('*', { count: 'exact', head: true });

        // Fetch users count (admin only)
        let totalUsers = 0;
        if (isAdmin) {
          const { count } = await supabase
            .from('profiles')
            .select('*', { count: 'exact', head: true });
          totalUsers = count || 0;
        }

        setStats({
          totalLeads: totalLeads || 0,
          pendingLeads: pendingLeads || 0,
          totalPosts: totalPosts || 0,
          publishedPosts: publishedPosts || 0,
          totalImages: totalImages || 0,
          totalUsers,
        });
      } catch (error) {
        console.error('Error fetching stats:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, [isAdmin]);

  const statCards = [
    {
      titleMs: 'Jumlah Leads',
      titleEn: 'Total Leads',
      value: stats.totalLeads,
      subValue: stats.pendingLeads,
      subLabelMs: 'Menunggu',
      subLabelEn: 'Pending',
      icon: CalendarCheck,
      href: '/admin/leads',
      color: 'text-blue-500',
      bgColor: 'bg-blue-500/10',
    },
    {
      titleMs: 'Blog Posts',
      titleEn: 'Blog Posts',
      value: stats.totalPosts,
      subValue: stats.publishedPosts,
      subLabelMs: 'Diterbitkan',
      subLabelEn: 'Published',
      icon: FileText,
      href: '/admin/blog',
      color: 'text-green-500',
      bgColor: 'bg-green-500/10',
    },
    {
      titleMs: 'Imej Galeri',
      titleEn: 'Gallery Images',
      value: stats.totalImages,
      icon: Image,
      href: '/admin/gallery',
      color: 'text-purple-500',
      bgColor: 'bg-purple-500/10',
    },
    ...(isAdmin ? [{
      titleMs: 'Pengguna',
      titleEn: 'Users',
      value: stats.totalUsers,
      icon: Users,
      href: '/admin/users',
      color: 'text-orange-500',
      bgColor: 'bg-orange-500/10',
    }] : []),
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          {language === 'ms' ? 'Dashboard' : 'Dashboard'}
        </h1>
        <p className="text-muted-foreground">
          {language === 'ms' 
            ? 'Selamat datang ke panel admin.' 
            : 'Welcome to the admin panel.'}
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {statCards.map((card) => (
          <Link key={card.href} to={card.href}>
            <Card className="transition-shadow hover:shadow-md">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {language === 'ms' ? card.titleMs : card.titleEn}
                </CardTitle>
                <div className={`rounded-full p-2 ${card.bgColor}`}>
                  <card.icon className={`h-4 w-4 ${card.color}`} />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {loading ? '...' : card.value}
                </div>
                {card.subValue !== undefined && (
                  <p className="text-xs text-muted-foreground">
                    {card.subValue} {language === 'ms' ? card.subLabelMs : card.subLabelEn}
                  </p>
                )}
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {/* Quick Actions */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              {language === 'ms' ? 'Tindakan Pantas' : 'Quick Actions'}
            </CardTitle>
            <CardDescription>
              {language === 'ms' 
                ? 'Akses pantas ke fungsi utama' 
                : 'Quick access to main functions'}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2">
            <Link 
              to="/admin/leads" 
              className="flex items-center gap-2 rounded-lg border p-3 hover:bg-muted/50 transition-colors"
            >
              <CalendarCheck className="h-4 w-4 text-primary" />
              <span>{language === 'ms' ? 'Urus Leads' : 'Manage Leads'}</span>
            </Link>
            <Link 
              to="/admin/blog/new" 
              className="flex items-center gap-2 rounded-lg border p-3 hover:bg-muted/50 transition-colors"
            >
              <FileText className="h-4 w-4 text-primary" />
              <span>{language === 'ms' ? 'Tulis Post Baru' : 'Write New Post'}</span>
            </Link>
            <Link 
              to="/admin/gallery" 
              className="flex items-center gap-2 rounded-lg border p-3 hover:bg-muted/50 transition-colors"
            >
              <Image className="h-4 w-4 text-primary" />
              <span>{language === 'ms' ? 'Muat Naik Imej' : 'Upload Images'}</span>
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              {language === 'ms' ? 'Ringkasan' : 'Summary'}
            </CardTitle>
            <CardDescription>
              {language === 'ms' 
                ? 'Gambaran keseluruhan prestasi' 
                : 'Overall performance overview'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">
                  {language === 'ms' ? 'Leads Menunggu' : 'Pending Leads'}
                </span>
                <span className="font-medium">{loading ? '...' : stats.pendingLeads}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">
                  {language === 'ms' ? 'Posts Diterbitkan' : 'Published Posts'}
                </span>
                <span className="font-medium">{loading ? '...' : stats.publishedPosts}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">
                  {language === 'ms' ? 'Imej Galeri' : 'Gallery Images'}
                </span>
                <span className="font-medium">{loading ? '...' : stats.totalImages}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
