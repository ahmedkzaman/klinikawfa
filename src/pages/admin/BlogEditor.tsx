import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Tables } from '@/integrations/supabase/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft, Loader2, Save } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

type BlogPost = Tables<'blog_posts'>;
type BlogCategory = Tables<'blog_categories'>;

export default function BlogEditor() {
  const { id } = useParams();
  const isNew = id === 'new';
  const { language } = useLanguage();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [categories, setCategories] = useState<BlogCategory[]>([]);

  const [formData, setFormData] = useState({
    title: '',
    slug: '',
    content: '',
    category_id: '',
    published: false,
  });

  useEffect(() => {
    const fetchData = async () => {
      // Fetch categories
      const { data: cats } = await supabase
        .from('blog_categories')
        .select('*')
        .order('name');
      setCategories(cats || []);

      // Fetch post if editing
      if (!isNew && id) {
        const { data: post, error } = await supabase
          .from('blog_posts')
          .select('*')
          .eq('id', id)
          .single();

        if (error || !post) {
          toast({
            title: language === 'ms' ? 'Ralat' : 'Error',
            description: language === 'ms' ? 'Post tidak dijumpai.' : 'Post not found.',
            variant: 'destructive',
          });
          navigate('/admin/blog');
          return;
        }

        setFormData({
          title: post.title,
          slug: post.slug,
          content: post.content,
          category_id: post.category_id || '',
          published: post.published,
        });
      }
      setLoading(false);
    };

    fetchData();
  }, [id, isNew, navigate, toast, language]);

  const generateSlug = (title: string) => {
    return title
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .trim();
  };

  const handleTitleChange = (title: string) => {
    setFormData(prev => ({
      ...prev,
      title,
      slug: isNew ? generateSlug(title) : prev.slug,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.title.trim() || !formData.slug.trim() || !formData.content.trim()) {
      toast({
        title: language === 'ms' ? 'Ralat' : 'Error',
        description: language === 'ms' 
          ? 'Sila isi semua medan wajib.' 
          : 'Please fill in all required fields.',
        variant: 'destructive',
      });
      return;
    }

    setSaving(true);
    try {
      const postData = {
        title: formData.title.trim(),
        slug: formData.slug.trim(),
        content: formData.content.trim(),
        category_id: formData.category_id || null,
        published: formData.published,
        published_at: formData.published ? new Date().toISOString() : null,
        author_id: user?.id || null,
      };

      if (isNew) {
        const { error } = await supabase
          .from('blog_posts')
          .insert(postData);

        if (error) throw error;

        toast({
          title: language === 'ms' ? 'Berjaya' : 'Success',
          description: language === 'ms' ? 'Post dicipta.' : 'Post created.',
        });
      } else {
        const { error } = await supabase
          .from('blog_posts')
          .update(postData)
          .eq('id', id);

        if (error) throw error;

        toast({
          title: language === 'ms' ? 'Berjaya' : 'Success',
          description: language === 'ms' ? 'Post dikemaskini.' : 'Post updated.',
        });
      }

      navigate('/admin/blog');
    } catch (error: any) {
      console.error('Error saving post:', error);
      
      let errorMessage = language === 'ms' ? 'Gagal menyimpan post.' : 'Failed to save post.';
      if (error.message?.includes('duplicate key') || error.message?.includes('unique constraint')) {
        errorMessage = language === 'ms' 
          ? 'Slug sudah digunakan. Sila gunakan slug lain.'
          : 'Slug already exists. Please use a different slug.';
      }

      toast({
        title: language === 'ms' ? 'Ralat' : 'Error',
        description: errorMessage,
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate('/admin/blog')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {isNew 
              ? (language === 'ms' ? 'Post Baru' : 'New Post')
              : (language === 'ms' ? 'Edit Post' : 'Edit Post')}
          </h1>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>
                  {language === 'ms' ? 'Kandungan' : 'Content'}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="title">
                    {language === 'ms' ? 'Tajuk' : 'Title'} *
                  </Label>
                  <Input
                    id="title"
                    value={formData.title}
                    onChange={(e) => handleTitleChange(e.target.value)}
                    placeholder={language === 'ms' ? 'Tajuk post...' : 'Post title...'}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="slug">Slug *</Label>
                  <Input
                    id="slug"
                    value={formData.slug}
                    onChange={(e) => setFormData(prev => ({ ...prev, slug: e.target.value }))}
                    placeholder="post-slug"
                  />
                  <p className="text-xs text-muted-foreground">
                    {language === 'ms' 
                      ? 'URL-friendly identifier untuk post ini'
                      : 'URL-friendly identifier for this post'}
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="content">
                    {language === 'ms' ? 'Kandungan' : 'Content'} *
                  </Label>
                  <Textarea
                    id="content"
                    value={formData.content}
                    onChange={(e) => setFormData(prev => ({ ...prev, content: e.target.value }))}
                    placeholder={language === 'ms' ? 'Tulis kandungan post...' : 'Write post content...'}
                    rows={15}
                    className="font-mono text-sm"
                  />
                  <p className="text-xs text-muted-foreground">
                    {language === 'ms' 
                      ? 'Anda boleh menggunakan Markdown untuk pemformatan'
                      : 'You can use Markdown for formatting'}
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>
                  {language === 'ms' ? 'Tetapan' : 'Settings'}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label htmlFor="published">
                    {language === 'ms' ? 'Terbitkan' : 'Publish'}
                  </Label>
                  <Switch
                    id="published"
                    checked={formData.published}
                    onCheckedChange={(checked) => 
                      setFormData(prev => ({ ...prev, published: checked }))
                    }
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="category">
                    {language === 'ms' ? 'Kategori' : 'Category'}
                  </Label>
                  <Select
                    value={formData.category_id}
                    onValueChange={(value) => 
                      setFormData(prev => ({ ...prev, category_id: value }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={language === 'ms' ? 'Pilih kategori' : 'Select category'} />
                    </SelectTrigger>
                    <SelectContent>
                      {categories.map((cat) => (
                        <SelectItem key={cat.id} value={cat.id}>
                          {cat.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            <Button type="submit" className="w-full" disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              <Save className="mr-2 h-4 w-4" />
              {language === 'ms' ? 'Simpan' : 'Save'}
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}
