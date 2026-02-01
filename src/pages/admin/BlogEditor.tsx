import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ArrowLeft, Loader2, Save, Globe, Clock } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { AIWritingAssistant } from '@/components/blog';

interface BlogCategory {
  id: string;
  name: string;
  name_ms: string | null;
  name_en: string | null;
  slug: string;
}

interface GeneratedContent {
  title_ms: string;
  title_en: string;
  content_ms: string;
  content_en: string;
  excerpt_ms: string;
  excerpt_en: string;
  suggested_reading_time: number;
}

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
  const [activeTab, setActiveTab] = useState<'ms' | 'en'>('ms');

  const [formData, setFormData] = useState({
    title: '',
    title_ms: '',
    title_en: '',
    slug: '',
    content: '',
    content_ms: '',
    content_en: '',
    excerpt_ms: '',
    excerpt_en: '',
    featured_image: '',
    reading_time: 5,
    category_id: '',
    published: false,
  });

  useEffect(() => {
    const fetchData = async () => {
      // Fetch categories
      const { data: cats } = await supabase
        .from('blog_categories')
        .select('id, name, name_ms, name_en, slug')
        .order('name');
      setCategories((cats as BlogCategory[]) || []);

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
          title_ms: (post as any).title_ms || post.title || '',
          title_en: (post as any).title_en || post.title || '',
          slug: post.slug,
          content: post.content,
          content_ms: (post as any).content_ms || post.content || '',
          content_en: (post as any).content_en || post.content || '',
          excerpt_ms: (post as any).excerpt_ms || '',
          excerpt_en: (post as any).excerpt_en || '',
          featured_image: (post as any).featured_image || '',
          reading_time: (post as any).reading_time || 5,
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

  const handleTitleChange = (title: string, lang: 'ms' | 'en') => {
    if (lang === 'ms') {
      setFormData(prev => ({
        ...prev,
        title_ms: title,
        title: title, // Keep legacy title synced with MS
        slug: isNew ? generateSlug(title) : prev.slug,
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        title_en: title,
      }));
    }
  };

  const handleAIContentGenerated = (content: GeneratedContent) => {
    setFormData(prev => ({
      ...prev,
      title_ms: content.title_ms,
      title_en: content.title_en,
      title: content.title_ms, // Legacy
      content_ms: content.content_ms,
      content_en: content.content_en,
      content: content.content_ms, // Legacy
      excerpt_ms: content.excerpt_ms,
      excerpt_en: content.excerpt_en,
      reading_time: content.suggested_reading_time,
      slug: isNew ? generateSlug(content.title_en) : prev.slug,
    }));
  };

  const getSelectedCategoryName = () => {
    const cat = categories.find(c => c.id === formData.category_id);
    if (!cat) return '';
    return language === 'ms' ? (cat.name_ms || cat.name) : (cat.name_en || cat.name);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate required fields
    const hasContent = formData.title_ms.trim() || formData.title_en.trim();
    if (!hasContent || !formData.slug.trim()) {
      toast({
        title: language === 'ms' ? 'Ralat' : 'Error',
        description: language === 'ms' 
          ? 'Sila isi tajuk dan slug.' 
          : 'Please fill in title and slug.',
        variant: 'destructive',
      });
      return;
    }

    if (!formData.content_ms.trim() && !formData.content_en.trim()) {
      toast({
        title: language === 'ms' ? 'Ralat' : 'Error',
        description: language === 'ms' 
          ? 'Sila isi kandungan dalam sekurang-kurangnya satu bahasa.' 
          : 'Please fill in content in at least one language.',
        variant: 'destructive',
      });
      return;
    }

    setSaving(true);
    try {
      const postData = {
        title: formData.title_ms.trim() || formData.title_en.trim(),
        title_ms: formData.title_ms.trim() || null,
        title_en: formData.title_en.trim() || null,
        slug: formData.slug.trim(),
        content: formData.content_ms.trim() || formData.content_en.trim(),
        content_ms: formData.content_ms.trim() || null,
        content_en: formData.content_en.trim() || null,
        excerpt_ms: formData.excerpt_ms.trim() || null,
        excerpt_en: formData.excerpt_en.trim() || null,
        featured_image: formData.featured_image.trim() || null,
        reading_time: formData.reading_time,
        category_id: formData.category_id || null,
        published: formData.published,
        published_at: formData.published ? new Date().toISOString() : null,
        author_id: user?.id || null,
      };

      if (isNew) {
        const { error } = await supabase
          .from('blog_posts')
          .insert(postData as any);

        if (error) throw error;

        toast({
          title: language === 'ms' ? 'Berjaya' : 'Success',
          description: language === 'ms' ? 'Post dicipta.' : 'Post created.',
        });
      } else {
        const { error } = await supabase
          .from('blog_posts')
          .update(postData as any)
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
          <p className="text-sm text-muted-foreground">
            {language === 'ms' 
              ? 'Tulis kandungan dalam Bahasa Melayu dan Inggeris'
              : 'Write content in Malay and English'}
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Language Tabs for Content */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Globe className="h-5 w-5 text-primary" />
                    <CardTitle>
                      {language === 'ms' ? 'Kandungan Dwibahasa' : 'Bilingual Content'}
                    </CardTitle>
                  </div>
                </div>
                <CardDescription>
                  {language === 'ms' 
                    ? 'Tulis kandungan dalam kedua-dua bahasa untuk capaian lebih luas'
                    : 'Write content in both languages for wider reach'}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'ms' | 'en')}>
                  <TabsList className="mb-4">
                    <TabsTrigger value="ms" className="gap-2">
                      🇲🇾 Bahasa Melayu
                    </TabsTrigger>
                    <TabsTrigger value="en" className="gap-2">
                      🇬🇧 English
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="ms" className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="title_ms">Tajuk (BM) *</Label>
                      <Input
                        id="title_ms"
                        value={formData.title_ms}
                        onChange={(e) => handleTitleChange(e.target.value, 'ms')}
                        placeholder="Tajuk dalam Bahasa Melayu..."
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="excerpt_ms">Ringkasan (BM)</Label>
                      <Textarea
                        id="excerpt_ms"
                        value={formData.excerpt_ms}
                        onChange={(e) => setFormData(prev => ({ ...prev, excerpt_ms: e.target.value }))}
                        placeholder="Ringkasan pendek untuk pratonton..."
                        rows={2}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="content_ms">Kandungan (BM) *</Label>
                      <Textarea
                        id="content_ms"
                        value={formData.content_ms}
                        onChange={(e) => setFormData(prev => ({ ...prev, content_ms: e.target.value, content: e.target.value }))}
                        placeholder="Tulis kandungan dalam Bahasa Melayu..."
                        rows={15}
                        className="font-mono text-sm"
                      />
                      <p className="text-xs text-muted-foreground">
                        Anda boleh menggunakan Markdown untuk pemformatan
                      </p>
                    </div>
                  </TabsContent>

                  <TabsContent value="en" className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="title_en">Title (EN) *</Label>
                      <Input
                        id="title_en"
                        value={formData.title_en}
                        onChange={(e) => handleTitleChange(e.target.value, 'en')}
                        placeholder="Title in English..."
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="excerpt_en">Excerpt (EN)</Label>
                      <Textarea
                        id="excerpt_en"
                        value={formData.excerpt_en}
                        onChange={(e) => setFormData(prev => ({ ...prev, excerpt_en: e.target.value }))}
                        placeholder="Short excerpt for preview..."
                        rows={2}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="content_en">Content (EN) *</Label>
                      <Textarea
                        id="content_en"
                        value={formData.content_en}
                        onChange={(e) => setFormData(prev => ({ ...prev, content_en: e.target.value }))}
                        placeholder="Write content in English..."
                        rows={15}
                        className="font-mono text-sm"
                      />
                      <p className="text-xs text-muted-foreground">
                        You can use Markdown for formatting
                      </p>
                    </div>
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>

            {/* Slug & Image */}
            <Card>
              <CardHeader>
                <CardTitle>{language === 'ms' ? 'Maklumat Tambahan' : 'Additional Info'}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
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
                  <Label htmlFor="featured_image">
                    {language === 'ms' ? 'Imej Utama (URL)' : 'Featured Image (URL)'}
                  </Label>
                  <Input
                    id="featured_image"
                    value={formData.featured_image}
                    onChange={(e) => setFormData(prev => ({ ...prev, featured_image: e.target.value }))}
                    placeholder="https://example.com/image.jpg"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="reading_time" className="flex items-center gap-2">
                    <Clock className="h-4 w-4" />
                    {language === 'ms' ? 'Anggaran Masa Membaca' : 'Estimated Reading Time'}
                  </Label>
                  <div className="flex items-center gap-2">
                    <Input
                      id="reading_time"
                      type="number"
                      min="1"
                      max="60"
                      value={formData.reading_time}
                      onChange={(e) => setFormData(prev => ({ ...prev, reading_time: parseInt(e.target.value) || 5 }))}
                      className="w-20"
                    />
                    <span className="text-sm text-muted-foreground">
                      {language === 'ms' ? 'minit' : 'minutes'}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* AI Writing Assistant */}
            <AIWritingAssistant 
              onContentGenerated={handleAIContentGenerated}
              categoryName={getSelectedCategoryName()}
            />

            {/* Settings */}
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
                          {language === 'ms' ? (cat.name_ms || cat.name) : (cat.name_en || cat.name)}
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

            {/* Medical Disclaimer Note */}
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
              <strong>{language === 'ms' ? 'Peringatan:' : 'Note:'}</strong>{' '}
              {language === 'ms' 
                ? 'Pastikan kandungan mematuhi garis panduan perubatan dan tidak mengandungi jaminan kesembuhan.'
                : 'Ensure content follows medical guidelines and does not contain cure guarantees.'}
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}
