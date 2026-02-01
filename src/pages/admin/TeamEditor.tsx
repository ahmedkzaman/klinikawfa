import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useLanguage } from '@/contexts/LanguageContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { 
  ArrowLeft,
  Loader2,
  Save,
  Upload,
  X,
  User,
  Stethoscope,
  Users
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface TeamMemberForm {
  type: 'doctor' | 'staff';
  name_ms: string;
  name_en: string;
  title_ms: string;
  title_en: string;
  qualifications: string[];
  years_experience: number | null;
  expertise_ms: string[];
  expertise_en: string[];
  bio_ms: string;
  bio_en: string;
  photo_url: string | null;
  is_active: boolean;
}

const initialForm: TeamMemberForm = {
  type: 'doctor',
  name_ms: '',
  name_en: '',
  title_ms: '',
  title_en: '',
  qualifications: [],
  years_experience: null,
  expertise_ms: [],
  expertise_en: [],
  bio_ms: '',
  bio_en: '',
  photo_url: null,
  is_active: true,
};

export default function TeamEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { language } = useLanguage();
  const { toast } = useToast();
  
  const isNew = id === 'new';
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [form, setForm] = useState<TeamMemberForm>(initialForm);
  
  // Tag input states
  const [qualInput, setQualInput] = useState('');
  const [expertiseMsInput, setExpertiseMsInput] = useState('');
  const [expertiseEnInput, setExpertiseEnInput] = useState('');

  useEffect(() => {
    if (!isNew && id) {
      fetchMember(id);
    }
  }, [id, isNew]);

  const fetchMember = async (memberId: string) => {
    try {
      const { data, error } = await (supabase as any)
        .from('team_members')
        .select('*')
        .eq('id', memberId)
        .single();

      if (error) throw error;
      if (!data) {
        navigate('/admin/team');
        return;
      }

      setForm({
        type: data.type as 'doctor' | 'staff',
        name_ms: data.name_ms,
        name_en: data.name_en,
        title_ms: data.title_ms,
        title_en: data.title_en,
        qualifications: data.qualifications || [],
        years_experience: data.years_experience,
        expertise_ms: data.expertise_ms || [],
        expertise_en: data.expertise_en || [],
        bio_ms: data.bio_ms || '',
        bio_en: data.bio_en || '',
        photo_url: data.photo_url,
        is_active: data.is_active,
      });
    } catch (error) {
      console.error('Error fetching member:', error);
      toast({
        title: language === 'ms' ? 'Ralat' : 'Error',
        description: language === 'ms' ? 'Gagal memuatkan data.' : 'Failed to load data.',
        variant: 'destructive',
      });
      navigate('/admin/team');
    } finally {
      setLoading(false);
    }
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file
    if (!file.type.startsWith('image/')) {
      toast({
        title: language === 'ms' ? 'Ralat' : 'Error',
        description: language === 'ms' ? 'Sila pilih fail imej.' : 'Please select an image file.',
        variant: 'destructive',
      });
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast({
        title: language === 'ms' ? 'Ralat' : 'Error',
        description: language === 'ms' ? 'Saiz fail maksimum 5MB.' : 'Maximum file size is 5MB.',
        variant: 'destructive',
      });
      return;
    }

    setUploading(true);
    try {
      // Delete old photo if exists
      if (form.photo_url) {
        const oldFileName = form.photo_url.split('/').pop();
        if (oldFileName) {
          await supabase.storage.from('team-photos').remove([oldFileName]);
        }
      }

      // Upload new photo
      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('team-photos')
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('team-photos')
        .getPublicUrl(fileName);

      setForm(prev => ({ ...prev, photo_url: publicUrl }));

      toast({
        title: language === 'ms' ? 'Berjaya' : 'Success',
        description: language === 'ms' ? 'Gambar dimuat naik.' : 'Photo uploaded.',
      });
    } catch (error) {
      console.error('Error uploading photo:', error);
      toast({
        title: language === 'ms' ? 'Ralat' : 'Error',
        description: language === 'ms' ? 'Gagal memuat naik gambar.' : 'Failed to upload photo.',
        variant: 'destructive',
      });
    } finally {
      setUploading(false);
    }
  };

  const removePhoto = async () => {
    if (!form.photo_url) return;

    try {
      const fileName = form.photo_url.split('/').pop();
      if (fileName) {
        await supabase.storage.from('team-photos').remove([fileName]);
      }
      setForm(prev => ({ ...prev, photo_url: null }));
    } catch (error) {
      console.error('Error removing photo:', error);
    }
  };

  const addTag = (field: 'qualifications' | 'expertise_ms' | 'expertise_en', value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    
    if (!form[field].includes(trimmed)) {
      setForm(prev => ({ ...prev, [field]: [...prev[field], trimmed] }));
    }

    // Clear input
    if (field === 'qualifications') setQualInput('');
    if (field === 'expertise_ms') setExpertiseMsInput('');
    if (field === 'expertise_en') setExpertiseEnInput('');
  };

  const removeTag = (field: 'qualifications' | 'expertise_ms' | 'expertise_en', index: number) => {
    setForm(prev => ({
      ...prev,
      [field]: prev[field].filter((_, i) => i !== index),
    }));
  };

  const handleKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>,
    field: 'qualifications' | 'expertise_ms' | 'expertise_en',
    value: string
  ) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addTag(field, value);
    }
  };

  const handleSave = async () => {
    // Validation
    if (!form.name_ms || !form.name_en || !form.title_ms || !form.title_en) {
      toast({
        title: language === 'ms' ? 'Ralat' : 'Error',
        description: language === 'ms' 
          ? 'Sila isi semua medan yang diperlukan.' 
          : 'Please fill in all required fields.',
        variant: 'destructive',
      });
      return;
    }

    setSaving(true);
    try {
      const memberData = {
        type: form.type,
        name_ms: form.name_ms,
        name_en: form.name_en,
        title_ms: form.title_ms,
        title_en: form.title_en,
        qualifications: form.qualifications,
        years_experience: form.years_experience,
        expertise_ms: form.expertise_ms,
        expertise_en: form.expertise_en,
        bio_ms: form.bio_ms || null,
        bio_en: form.bio_en || null,
        photo_url: form.photo_url,
        is_active: form.is_active,
      };

      if (isNew) {
        // Get next display_order
        const { data: existing } = await (supabase as any)
          .from('team_members')
          .select('display_order')
          .order('display_order', { ascending: false })
          .limit(1);

        const nextOrder = existing && existing.length > 0 ? existing[0].display_order + 1 : 0;

        const { error } = await (supabase as any)
          .from('team_members')
          .insert({ ...memberData, display_order: nextOrder });

        if (error) throw error;
      } else {
        const { error } = await (supabase as any)
          .from('team_members')
          .update(memberData)
          .eq('id', id);

        if (error) throw error;
      }

      toast({
        title: language === 'ms' ? 'Berjaya' : 'Success',
        description: language === 'ms' ? 'Data disimpan.' : 'Data saved.',
      });

      navigate('/admin/team');
    } catch (error) {
      console.error('Error saving member:', error);
      toast({
        title: language === 'ms' ? 'Ralat' : 'Error',
        description: language === 'ms' ? 'Gagal menyimpan data.' : 'Failed to save data.',
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
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate('/admin/team')}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {isNew 
              ? (language === 'ms' ? 'Tambah Ahli Pasukan' : 'Add Team Member')
              : (language === 'ms' ? 'Edit Ahli Pasukan' : 'Edit Team Member')
            }
          </h1>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Photo & Type */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">
                {language === 'ms' ? 'Gambar' : 'Photo'}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex aspect-square items-center justify-center overflow-hidden rounded-lg bg-muted">
                {form.photo_url ? (
                  <img
                    src={form.photo_url}
                    alt="Profile"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <User className="h-16 w-16 text-muted-foreground" />
                )}
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  disabled={uploading}
                  onClick={() => document.getElementById('photo-upload')?.click()}
                >
                  {uploading ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Upload className="mr-2 h-4 w-4" />
                  )}
                  {language === 'ms' ? 'Muat Naik' : 'Upload'}
                </Button>
                {form.photo_url && (
                  <Button variant="outline" size="icon" onClick={removePhoto}>
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
              <input
                id="photo-upload"
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handlePhotoUpload}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">
                {language === 'ms' ? 'Jenis & Status' : 'Type & Status'}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>{language === 'ms' ? 'Jenis' : 'Type'}</Label>
                <Select 
                  value={form.type} 
                  onValueChange={(v) => setForm(prev => ({ ...prev, type: v as 'doctor' | 'staff' }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="doctor">
                      <span className="flex items-center gap-2">
                        <Stethoscope className="h-4 w-4" />
                        {language === 'ms' ? 'Doktor' : 'Doctor'}
                      </span>
                    </SelectItem>
                    <SelectItem value="staff">
                      <span className="flex items-center gap-2">
                        <Users className="h-4 w-4" />
                        {language === 'ms' ? 'Kakitangan' : 'Staff'}
                      </span>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center justify-between">
                <Label>{language === 'ms' ? 'Aktif' : 'Active'}</Label>
                <Switch
                  checked={form.is_active}
                  onCheckedChange={(v) => setForm(prev => ({ ...prev, is_active: v }))}
                />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Main Form */}
        <div className="space-y-6 lg:col-span-2">
          {/* Basic Info */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">
                {language === 'ms' ? 'Maklumat Asas' : 'Basic Information'}
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="name_ms">
                  {language === 'ms' ? 'Nama (BM)' : 'Name (Malay)'} *
                </Label>
                <Input
                  id="name_ms"
                  value={form.name_ms}
                  onChange={(e) => setForm(prev => ({ ...prev, name_ms: e.target.value }))}
                  placeholder="Dr. Ahmad"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="name_en">
                  {language === 'ms' ? 'Nama (BI)' : 'Name (English)'} *
                </Label>
                <Input
                  id="name_en"
                  value={form.name_en}
                  onChange={(e) => setForm(prev => ({ ...prev, name_en: e.target.value }))}
                  placeholder="Dr. Ahmad"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="title_ms">
                  {language === 'ms' ? 'Jawatan (BM)' : 'Title (Malay)'} *
                </Label>
                <Input
                  id="title_ms"
                  value={form.title_ms}
                  onChange={(e) => setForm(prev => ({ ...prev, title_ms: e.target.value }))}
                  placeholder="Pengamal Perubatan Am"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="title_en">
                  {language === 'ms' ? 'Jawatan (BI)' : 'Title (English)'} *
                </Label>
                <Input
                  id="title_en"
                  value={form.title_en}
                  onChange={(e) => setForm(prev => ({ ...prev, title_en: e.target.value }))}
                  placeholder="General Medical Practitioner"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="years_experience">
                  {language === 'ms' ? 'Tahun Pengalaman' : 'Years of Experience'}
                </Label>
                <Input
                  id="years_experience"
                  type="number"
                  min={0}
                  value={form.years_experience ?? ''}
                  onChange={(e) => setForm(prev => ({ 
                    ...prev, 
                    years_experience: e.target.value ? parseInt(e.target.value) : null 
                  }))}
                  placeholder="10"
                />
              </div>
            </CardContent>
          </Card>

          {/* Qualifications */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">
                {language === 'ms' ? 'Kelayakan' : 'Qualifications'}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-2">
                {form.qualifications.map((q, i) => (
                  <Badge key={i} variant="secondary" className="gap-1">
                    {q}
                    <button onClick={() => removeTag('qualifications', i)}>
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
              <div className="flex gap-2">
                <Input
                  value={qualInput}
                  onChange={(e) => setQualInput(e.target.value)}
                  onKeyDown={(e) => handleKeyDown(e, 'qualifications', qualInput)}
                  placeholder="MBBS, Family Medicine..."
                />
                <Button 
                  variant="outline" 
                  onClick={() => addTag('qualifications', qualInput)}
                >
                  {language === 'ms' ? 'Tambah' : 'Add'}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                {language === 'ms' 
                  ? 'Tekan Enter atau koma untuk menambah'
                  : 'Press Enter or comma to add'
                }
              </p>
            </CardContent>
          </Card>

          {/* Expertise */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">
                {language === 'ms' ? 'Minat Khusus' : 'Special Interests'}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <Label>{language === 'ms' ? 'Bahasa Melayu' : 'Malay'}</Label>
                <div className="flex flex-wrap gap-2">
                  {form.expertise_ms.map((e, i) => (
                    <Badge key={i} variant="secondary" className="gap-1">
                      {e}
                      <button onClick={() => removeTag('expertise_ms', i)}>
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Input
                    value={expertiseMsInput}
                    onChange={(e) => setExpertiseMsInput(e.target.value)}
                    onKeyDown={(e) => handleKeyDown(e, 'expertise_ms', expertiseMsInput)}
                    placeholder="Perubatan Keluarga, Pembedahan Minor..."
                  />
                  <Button 
                    variant="outline" 
                    onClick={() => addTag('expertise_ms', expertiseMsInput)}
                  >
                    {language === 'ms' ? 'Tambah' : 'Add'}
                  </Button>
                </div>
              </div>

              <div className="space-y-4">
                <Label>{language === 'ms' ? 'Bahasa Inggeris' : 'English'}</Label>
                <div className="flex flex-wrap gap-2">
                  {form.expertise_en.map((e, i) => (
                    <Badge key={i} variant="secondary" className="gap-1">
                      {e}
                      <button onClick={() => removeTag('expertise_en', i)}>
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Input
                    value={expertiseEnInput}
                    onChange={(e) => setExpertiseEnInput(e.target.value)}
                    onKeyDown={(e) => handleKeyDown(e, 'expertise_en', expertiseEnInput)}
                    placeholder="Family Medicine, Minor Surgery..."
                  />
                  <Button 
                    variant="outline" 
                    onClick={() => addTag('expertise_en', expertiseEnInput)}
                  >
                    {language === 'ms' ? 'Tambah' : 'Add'}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Bio */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">
                {language === 'ms' ? 'Biografi' : 'Biography'}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="bio_ms">
                  {language === 'ms' ? 'Bahasa Melayu' : 'Malay'}
                </Label>
                <Textarea
                  id="bio_ms"
                  value={form.bio_ms}
                  onChange={(e) => setForm(prev => ({ ...prev, bio_ms: e.target.value }))}
                  rows={4}
                  placeholder={language === 'ms' 
                    ? 'Keterangan ringkas tentang doktor/kakitangan...'
                    : 'Brief description about the doctor/staff...'
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="bio_en">
                  {language === 'ms' ? 'Bahasa Inggeris' : 'English'}
                </Label>
                <Textarea
                  id="bio_en"
                  value={form.bio_en}
                  onChange={(e) => setForm(prev => ({ ...prev, bio_en: e.target.value }))}
                  rows={4}
                  placeholder="Brief description about the doctor/staff..."
                />
              </div>
            </CardContent>
          </Card>

          {/* Actions */}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => navigate('/admin/team')}>
              {language === 'ms' ? 'Batal' : 'Cancel'}
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              <Save className="mr-2 h-4 w-4" />
              {language === 'ms' ? 'Simpan' : 'Save'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
