import { useState, useEffect, useCallback, useRef } from 'react';
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
import { ArrowLeft, Loader2, Save, Globe, Clock, Upload, X, ImageIcon, CalendarClock, CheckCircle2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { AIWritingAssistant } from '@/components/blog';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { format, parseISO, set } from 'date-fns';

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
  const [uploadingImage, setUploadingImage] = useState(false);
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
    scheduled_at: null as string | null,
  });
  const [isScheduling, setIsScheduling] = useState(false);
  const [scheduledDate, setScheduledDate] = useState<Date | undefined>(undefined);
  const [scheduledTime, setScheduledTime] = useState('09:00');
  const [autoSaveStatus, setAutoSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const autoSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const hasRestoredDraft = useRef(false);

  // Auto-save draft storage key
  const draftKey = `blog-draft-${isNew ? 'new' : id}`;

  // Auto-save form data to localStorage
  const saveDraft = useCallback(() => {
    const draftData = {
      formData,
      activeTab,
      isScheduling,
      scheduledDate: scheduledDate?.toISOString() || null,
      scheduledTime,
      savedAt: new Date().toISOString(),
    };
    localStorage.setItem(draftKey, JSON.stringify(draftData));
    setAutoSaveStatus('saved');
  }, [formData, activeTab, isScheduling, scheduledDate, scheduledTime, draftKey]);

  // Debounced auto-save effect
  useEffect(() => {
    // Don't auto-save during initial load
    if (loading || !hasRestoredDraft.current) return;

    setAutoSaveStatus('saving');
    
    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current);
    }

    autoSaveTimeoutRef.current = setTimeout(() => {
      saveDraft();
    }, 2000);

    return () => {
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
      }
    };
  }, [formData, activeTab, isScheduling, scheduledDate, scheduledTime, loading, saveDraft]);

  // Clear draft after successful save
  const clearDraft = useCallback(() => {
    localStorage.removeItem(draftKey);
  }, [draftKey]);

  useEffect(() => {
    const fetchData = async () => {
      // Fetch categories
      const { data: cats } = await supabase
        .from('blog_categories')
        .select('id, name, name_ms, name_en, slug')
        .order('name');
      setCategories((cats as BlogCategory[]) || []);

      // Check for saved draft first
      const savedDraft = localStorage.getItem(draftKey);
      if (savedDraft) {
        try {
          const draft = JSON.parse(savedDraft);
          setFormData(draft.formData);
          setActiveTab(draft.activeTab || 'ms');
          setIsScheduling(draft.isScheduling || false);
          if (draft.scheduledDate) {
            setScheduledDate(parseISO(draft.scheduledDate));
          }
          setScheduledTime(draft.scheduledTime || '09:00');
          
          hasRestoredDraft.current = true;
          setLoading(false);
          
          toast({
            title: language === 'ms' ? 'Draf dipulihkan' : 'Draft restored',
            description: language === 'ms' 
              ? 'Kerja anda yang tidak disimpan telah dipulihkan.'
              : 'Your unsaved work has been restored.',
          });
          return;
        } catch (e) {
          // Invalid draft, remove it
          localStorage.removeItem(draftKey);
        }
      }

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

        const scheduledAtValue = (post as any).scheduled_at;
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
          scheduled_at: scheduledAtValue || null,
        });
        
        // Initialize scheduling state if post has scheduled_at
        if (scheduledAtValue) {
          const scheduledDateTime = parseISO(scheduledAtValue);
          setIsScheduling(true);
          setScheduledDate(scheduledDateTime);
          setScheduledTime(format(scheduledDateTime, 'HH:mm'));
        }
      }
      
      hasRestoredDraft.current = true;
      setLoading(false);
    };

    fetchData();
  }, [id, isNew, navigate, toast, language, draftKey]);

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

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast({
        title: language === 'ms' ? 'Ralat' : 'Error',
        description: language === 'ms' ? 'Sila pilih fail imej.' : 'Please select an image file.',
        variant: 'destructive',
      });
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast({
        title: language === 'ms' ? 'Ralat' : 'Error',
        description: language === 'ms' ? 'Saiz fail maksimum 5MB.' : 'Maximum file size is 5MB.',
        variant: 'destructive',
      });
      return;
    }

    setUploadingImage(true);
    try {
      // Generate unique filename
      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}.${fileExt}`;
      const filePath = `blog/${fileName}`;

      // Upload to storage
      const { error: uploadError } = await supabase.storage
        .from('gallery')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('gallery')
        .getPublicUrl(filePath);

      setFormData(prev => ({ ...prev, featured_image: publicUrl }));

      toast({
        title: language === 'ms' ? 'Berjaya' : 'Success',
        description: language === 'ms' ? 'Imej dimuat naik.' : 'Image uploaded.',
      });
    } catch (error) {
      console.error('Error uploading image:', error);
      toast({
        title: language === 'ms' ? 'Ralat' : 'Error',
        description: language === 'ms' ? 'Gagal memuat naik imej.' : 'Failed to upload image.',
        variant: 'destructive',
      });
    } finally {
      setUploadingImage(false);
    }
  };

  const removeImage = () => {
    setFormData(prev => ({ ...prev, featured_image: '' }));
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
      // Calculate scheduled_at datetime
      let scheduledAtValue: string | null = null;
      if (isScheduling && scheduledDate) {
        const [hours, minutes] = scheduledTime.split(':').map(Number);
        const scheduledDateTime = set(scheduledDate, { hours, minutes, seconds: 0 });
        scheduledAtValue = scheduledDateTime.toISOString();
      }

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
        published: isScheduling ? true : formData.published, // Auto-set published for scheduled posts
        published_at: formData.published ? new Date().toISOString() : null,
        scheduled_at: scheduledAtValue,
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

      // Clear draft on successful save
      clearDraft();
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
          {autoSaveStatus === 'saved' && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
              <CheckCircle2 className="h-3 w-3 text-green-500" />
              {language === 'ms' ? 'Draf disimpan' : 'Draft saved'}
            </div>
          )}
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
                  <Label>
                    {language === 'ms' ? 'Imej Utama' : 'Featured Image'}
                  </Label>
                  
                  {formData.featured_image ? (
                    <div className="relative rounded-lg overflow-hidden border">
                      <img 
                        src={formData.featured_image} 
                        alt="Featured" 
                        className="w-full h-48 object-cover"
                      />
                      <Button
                        type="button"
                        variant="destructive"
                        size="icon"
                        className="absolute top-2 right-2 h-8 w-8"
                        onClick={removeImage}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : (
                    <div className="border-2 border-dashed rounded-lg p-6 text-center">
                      <ImageIcon className="mx-auto h-10 w-10 text-muted-foreground mb-2" />
                      <p className="text-sm text-muted-foreground mb-3">
                        {language === 'ms' 
                          ? 'Muat naik imej untuk post ini'
                          : 'Upload an image for this post'}
                      </p>
                      <label>
                        <Input
                          type="file"
                          accept="image/*"
                          onChange={handleImageUpload}
                          className="hidden"
                          disabled={uploadingImage}
                        />
                        <Button type="button" variant="secondary" size="sm" asChild disabled={uploadingImage}>
                          <span className="cursor-pointer">
                            {uploadingImage ? (
                              <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                {language === 'ms' ? 'Memuat naik...' : 'Uploading...'}
                              </>
                            ) : (
                              <>
                                <Upload className="mr-2 h-4 w-4" />
                                {language === 'ms' ? 'Pilih Imej' : 'Choose Image'}
                              </>
                            )}
                          </span>
                        </Button>
                      </label>
                    </div>
                  )}
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
                    onCheckedChange={(checked) => {
                      setFormData(prev => ({ ...prev, published: checked }));
                      if (checked) {
                        setIsScheduling(false);
                        setScheduledDate(undefined);
                      }
                    }}
                    disabled={isScheduling}
                  />
                </div>

                {/* Schedule for later option */}
                {!formData.published && (
                  <div className="space-y-3 pt-2 border-t">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="schedule" className="flex items-center gap-2">
                        <CalendarClock className="h-4 w-4" />
                        {language === 'ms' ? 'Jadualkan' : 'Schedule for later'}
                      </Label>
                      <Switch
                        id="schedule"
                        checked={isScheduling}
                        onCheckedChange={(checked) => {
                          setIsScheduling(checked);
                          if (!checked) {
                            setScheduledDate(undefined);
                            setScheduledTime('09:00');
                          }
                        }}
                      />
                    </div>

                    {isScheduling && (
                      <div className="space-y-3 animate-in fade-in slide-in-from-top-2">
                        <div className="space-y-2">
                          <Label>{language === 'ms' ? 'Tarikh' : 'Date'}</Label>
                          <Popover>
                            <PopoverTrigger asChild>
                              <Button
                                variant="outline"
                                className={cn(
                                  "w-full justify-start text-left font-normal",
                                  !scheduledDate && "text-muted-foreground"
                                )}
                              >
                                <CalendarClock className="mr-2 h-4 w-4" />
                                {scheduledDate ? format(scheduledDate, 'PPP') : (
                                  language === 'ms' ? 'Pilih tarikh' : 'Pick a date'
                                )}
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="start">
                              <Calendar
                                mode="single"
                                selected={scheduledDate}
                                onSelect={setScheduledDate}
                                disabled={(date) => date < new Date()}
                                initialFocus
                                className="p-3 pointer-events-auto"
                              />
                            </PopoverContent>
                          </Popover>
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="scheduledTime">{language === 'ms' ? 'Masa' : 'Time'}</Label>
                          <Input
                            id="scheduledTime"
                            type="time"
                            value={scheduledTime}
                            onChange={(e) => setScheduledTime(e.target.value)}
                            className="w-full"
                          />
                        </div>

                        {scheduledDate && (
                          <div className="rounded-lg bg-primary/10 p-3 text-sm">
                            <p className="text-primary font-medium">
                              {language === 'ms' ? 'Dijadualkan untuk:' : 'Scheduled for:'}
                            </p>
                            <p className="text-muted-foreground">
                              {format(scheduledDate, 'EEEE, d MMMM yyyy')} {language === 'ms' ? 'pada' : 'at'} {scheduledTime}
                            </p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Show scheduled info if already scheduled */}
                {formData.scheduled_at && new Date(formData.scheduled_at) > new Date() && (
                  <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-sm dark:bg-amber-950 dark:border-amber-800">
                    <p className="text-amber-800 dark:text-amber-200 font-medium flex items-center gap-2">
                      <CalendarClock className="h-4 w-4" />
                      {language === 'ms' ? 'Dijadualkan' : 'Scheduled'}
                    </p>
                    <p className="text-amber-700 dark:text-amber-300">
                      {format(parseISO(formData.scheduled_at), 'PPP')} {language === 'ms' ? 'pada' : 'at'} {format(parseISO(formData.scheduled_at), 'HH:mm')}
                    </p>
                  </div>
                )}

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
