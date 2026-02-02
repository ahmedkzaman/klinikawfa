import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useLanguage } from '@/contexts/LanguageContext';
import { supabase } from '@/integrations/supabase/client';
import { Tables } from '@/integrations/supabase/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { 
  Plus, 
  Search, 
  Pencil, 
  Trash2, 
  Loader2,
  RefreshCw,
  Eye,
  EyeOff
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';

interface BlogPost {
  id: string;
  title: string;
  title_ms: string | null;
  title_en: string | null;
  slug: string;
  published: boolean;
  published_at: string | null;
  scheduled_at: string | null;
  created_at: string;
}

export default function BlogManagement() {
  const { language } = useLanguage();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchPosts = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('blog_posts')
        .select('id, title, title_ms, title_en, slug, published, published_at, scheduled_at, created_at')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setPosts((data as BlogPost[]) || []);
    } catch (error) {
      console.error('Error fetching posts:', error);
      toast({
        title: language === 'ms' ? 'Ralat' : 'Error',
        description: language === 'ms' ? 'Gagal memuatkan posts.' : 'Failed to load posts.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPosts();
  }, []);

  const getPostTitle = (post: BlogPost) => {
    if (language === 'ms') {
      return post.title_ms || post.title_en || post.title;
    }
    return post.title_en || post.title_ms || post.title;
  };

  const filteredPosts = posts.filter((post) => {
    const title = getPostTitle(post).toLowerCase();
    const query = searchQuery.toLowerCase();
    return title.includes(query) || post.slug.toLowerCase().includes(query);
  });

  const togglePublish = async (post: BlogPost) => {
    try {
      const newPublished = !post.published;
      const { error } = await supabase
        .from('blog_posts')
        .update({ 
          published: newPublished,
          published_at: newPublished ? new Date().toISOString() : null
        })
        .eq('id', post.id);

      if (error) throw error;

      setPosts(posts.map(p => 
        p.id === post.id 
          ? { ...p, published: newPublished, published_at: newPublished ? new Date().toISOString() : null } 
          : p
      ));

      toast({
        title: language === 'ms' ? 'Berjaya' : 'Success',
        description: newPublished 
          ? (language === 'ms' ? 'Post diterbitkan.' : 'Post published.')
          : (language === 'ms' ? 'Post tidak diterbitkan.' : 'Post unpublished.'),
      });
    } catch (error) {
      console.error('Error toggling publish:', error);
      toast({
        title: language === 'ms' ? 'Ralat' : 'Error',
        description: language === 'ms' ? 'Gagal mengemaskini post.' : 'Failed to update post.',
        variant: 'destructive',
      });
    }
  };

  const deletePost = async () => {
    if (!deleteId) return;
    
    setDeleting(true);
    try {
      const { error } = await supabase
        .from('blog_posts')
        .delete()
        .eq('id', deleteId);

      if (error) throw error;

      setPosts(posts.filter(p => p.id !== deleteId));
      toast({
        title: language === 'ms' ? 'Berjaya' : 'Success',
        description: language === 'ms' ? 'Post dipadam.' : 'Post deleted.',
      });
    } catch (error) {
      console.error('Error deleting post:', error);
      toast({
        title: language === 'ms' ? 'Ralat' : 'Error',
        description: language === 'ms' ? 'Gagal memadam post.' : 'Failed to delete post.',
        variant: 'destructive',
      });
    } finally {
      setDeleting(false);
      setDeleteId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {language === 'ms' ? 'Blog Posts' : 'Blog Posts'}
          </h1>
          <p className="text-muted-foreground">
            {language === 'ms' 
              ? `${filteredPosts.length} posts dijumpai` 
              : `${filteredPosts.length} posts found`}
          </p>
        </div>

        <div className="flex gap-2">
          <Button variant="outline" size="icon" onClick={fetchPosts} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
          <Button onClick={() => navigate('/admin/blog/new')}>
            <Plus className="mr-2 h-4 w-4" />
            {language === 'ms' ? 'Post Baru' : 'New Post'}
          </Button>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder={language === 'ms' ? 'Cari tajuk atau slug...' : 'Search title or slug...'}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : filteredPosts.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">
              {language === 'ms' ? 'Tiada posts dijumpai.' : 'No posts found.'}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{language === 'ms' ? 'Tajuk' : 'Title'}</TableHead>
                    <TableHead>{language === 'ms' ? 'Slug' : 'Slug'}</TableHead>
                    <TableHead>{language === 'ms' ? 'Status' : 'Status'}</TableHead>
                    <TableHead>{language === 'ms' ? 'Dicipta' : 'Created'}</TableHead>
                    <TableHead className="text-right">{language === 'ms' ? 'Tindakan' : 'Actions'}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredPosts.map((post) => (
                    <TableRow key={post.id}>
                      <TableCell className="font-medium max-w-[200px] truncate">
                        {getPostTitle(post)}
                      </TableCell>
                      <TableCell className="text-muted-foreground max-w-[150px] truncate">
                        {post.slug}
                      </TableCell>
                      <TableCell>
                        {(() => {
                          const now = new Date();
                          const isScheduled = post.published && post.scheduled_at && new Date(post.scheduled_at) > now;
                          const isPublished = post.published && (!post.scheduled_at || new Date(post.scheduled_at) <= now);
                          
                          if (isScheduled) {
                            return (
                              <div className="space-y-1">
                                <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-300 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-700">
                                  {language === 'ms' ? 'Dijadualkan' : 'Scheduled'}
                                </Badge>
                                <p className="text-xs text-muted-foreground">
                                  {format(new Date(post.scheduled_at!), 'dd/MM/yyyy HH:mm')}
                                </p>
                              </div>
                            );
                          } else if (isPublished) {
                            return (
                              <Badge variant="default">
                                {language === 'ms' ? 'Diterbitkan' : 'Published'}
                              </Badge>
                            );
                          } else {
                            return (
                              <Badge variant="secondary">
                                {language === 'ms' ? 'Draf' : 'Draft'}
                              </Badge>
                            );
                          }
                        })()}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {format(new Date(post.created_at), 'dd/MM/yyyy')}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button 
                            variant="ghost" 
                            size="icon"
                            onClick={() => togglePublish(post)}
                            title={post.published ? 'Unpublish' : 'Publish'}
                          >
                            {post.published ? (
                              <EyeOff className="h-4 w-4" />
                            ) : (
                              <Eye className="h-4 w-4" />
                            )}
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="icon"
                            onClick={() => navigate(`/admin/blog/${post.id}`)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="icon"
                            onClick={() => setDeleteId(post.id)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {language === 'ms' ? 'Padam Post?' : 'Delete Post?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {language === 'ms' 
                ? 'Tindakan ini tidak boleh dibatalkan. Post akan dipadam secara kekal.'
                : 'This action cannot be undone. The post will be permanently deleted.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>
              {language === 'ms' ? 'Batal' : 'Cancel'}
            </AlertDialogCancel>
            <AlertDialogAction 
              onClick={deletePost} 
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {language === 'ms' ? 'Padam' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
