import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { useLanguage } from '@/contexts/LanguageContext';
import { supabase } from '@/integrations/supabase/client';
import { Settings as SettingsIcon, CreditCard, Eye, EyeOff, Loader2, CheckCircle, XCircle, Key, Shield, Video, Upload, Trash2, Image } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
interface StripeKeyState {
  value: string;
  show: boolean;
  hasValue: boolean;
  isSaving: boolean;
}

export default function Settings() {
  const { toast } = useToast();
  const { language } = useLanguage();
  const [isLoading, setIsLoading] = useState(false);
  
  const [secretKey, setSecretKey] = useState<StripeKeyState>({
    value: '',
    show: false,
    hasValue: false,
    isSaving: false,
  });
  
  const [restrictedKey, setRestrictedKey] = useState<StripeKeyState>({
    value: '',
    show: false,
    hasValue: false,
    isSaving: false,
  });

  // Video upload state
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [posterUrl, setPosterUrl] = useState<string | null>(null);
  const [isUploadingVideo, setIsUploadingVideo] = useState(false);
  const [isUploadingPoster, setIsUploadingPoster] = useState(false);
  const [isDeletingVideo, setIsDeletingVideo] = useState(false);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const posterInputRef = useRef<HTMLInputElement>(null);

  const MAX_VIDEO_SIZE = 50 * 1024 * 1024; // 50MB
  const MAX_POSTER_SIZE = 5 * 1024 * 1024; // 5MB
  const ALLOWED_VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/quicktime'];
  const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('app_settings')
        .select('key, value')
        .in('key', ['stripe_secret_key', 'stripe_restricted_key', 'homepage_video_url', 'homepage_video_poster']);

      if (error) throw error;

      data?.forEach((setting) => {
        if (setting.key === 'stripe_secret_key') {
          setSecretKey(prev => ({
            ...prev,
            value: setting.value || '',
            hasValue: (setting.value || '').length > 0,
          }));
        } else if (setting.key === 'stripe_restricted_key') {
          setRestrictedKey(prev => ({
            ...prev,
            value: setting.value || '',
            hasValue: (setting.value || '').length > 0,
          }));
        } else if (setting.key === 'homepage_video_url') {
          setVideoUrl(setting.value || null);
        } else if (setting.key === 'homepage_video_poster') {
          setPosterUrl(setting.value || null);
        }
      });
    } catch (error) {
      console.error('Error fetching settings:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleVideoUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!ALLOWED_VIDEO_TYPES.includes(file.type)) {
      toast({
        title: language === 'ms' ? 'Format Tidak Disokong' : 'Unsupported Format',
        description: language === 'ms' 
          ? 'Sila gunakan format MP4, WebM, atau MOV' 
          : 'Please use MP4, WebM, or MOV format',
        variant: 'destructive',
      });
      return;
    }

    // Validate file size
    if (file.size > MAX_VIDEO_SIZE) {
      toast({
        title: language === 'ms' ? 'Fail Terlalu Besar' : 'File Too Large',
        description: language === 'ms' 
          ? 'Saiz maksimum adalah 50MB' 
          : 'Maximum size is 50MB',
        variant: 'destructive',
      });
      return;
    }

    setIsUploadingVideo(true);
    try {
      const ext = file.name.split('.').pop();
      const filePath = `clinic/homepage-video.${ext}`;

      // Upload to storage
      const { error: uploadError } = await supabase.storage
        .from('videos')
        .upload(filePath, file, { upsert: true });

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: urlData } = supabase.storage.from('videos').getPublicUrl(filePath);
      const publicUrl = urlData.publicUrl;

      // Save to app_settings
      const { error: upsertError } = await supabase
        .from('app_settings')
        .upsert({ 
          key: 'homepage_video_url', 
          value: publicUrl,
          description: 'Homepage clinic video URL'
        }, { onConflict: 'key' });

      if (upsertError) throw upsertError;

      setVideoUrl(publicUrl);
      toast({
        title: language === 'ms' ? 'Berjaya' : 'Success',
        description: language === 'ms' ? 'Video telah dimuat naik' : 'Video has been uploaded',
      });
    } catch (error) {
      console.error('Error uploading video:', error);
      toast({
        title: language === 'ms' ? 'Ralat' : 'Error',
        description: language === 'ms' ? 'Gagal memuat naik video' : 'Failed to upload video',
        variant: 'destructive',
      });
    } finally {
      setIsUploadingVideo(false);
      if (videoInputRef.current) videoInputRef.current.value = '';
    }
  };

  const handlePosterUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      toast({
        title: language === 'ms' ? 'Format Tidak Disokong' : 'Unsupported Format',
        description: language === 'ms' 
          ? 'Sila gunakan format JPG, PNG, atau WebP' 
          : 'Please use JPG, PNG, or WebP format',
        variant: 'destructive',
      });
      return;
    }

    if (file.size > MAX_POSTER_SIZE) {
      toast({
        title: language === 'ms' ? 'Fail Terlalu Besar' : 'File Too Large',
        description: language === 'ms' 
          ? 'Saiz maksimum adalah 5MB' 
          : 'Maximum size is 5MB',
        variant: 'destructive',
      });
      return;
    }

    setIsUploadingPoster(true);
    try {
      const ext = file.name.split('.').pop();
      const filePath = `clinic/homepage-video-poster.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from('videos')
        .upload(filePath, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from('videos').getPublicUrl(filePath);
      const publicUrl = urlData.publicUrl;

      const { error: upsertError } = await supabase
        .from('app_settings')
        .upsert({ 
          key: 'homepage_video_poster', 
          value: publicUrl,
          description: 'Homepage video poster/thumbnail image'
        }, { onConflict: 'key' });

      if (upsertError) throw upsertError;

      setPosterUrl(publicUrl);
      toast({
        title: language === 'ms' ? 'Berjaya' : 'Success',
        description: language === 'ms' ? 'Poster telah dimuat naik' : 'Poster has been uploaded',
      });
    } catch (error) {
      console.error('Error uploading poster:', error);
      toast({
        title: language === 'ms' ? 'Ralat' : 'Error',
        description: language === 'ms' ? 'Gagal memuat naik poster' : 'Failed to upload poster',
        variant: 'destructive',
      });
    } finally {
      setIsUploadingPoster(false);
      if (posterInputRef.current) posterInputRef.current.value = '';
    }
  };

  const handleDeleteVideo = async () => {
    setIsDeletingVideo(true);
    try {
      // Delete video from storage
      const { error: deleteVideoError } = await supabase.storage
        .from('videos')
        .remove(['clinic/homepage-video.mp4', 'clinic/homepage-video.webm', 'clinic/homepage-video.mov']);

      // Delete poster from storage
      await supabase.storage
        .from('videos')
        .remove(['clinic/homepage-video-poster.jpg', 'clinic/homepage-video-poster.png', 'clinic/homepage-video-poster.webp']);

      // Clear settings
      await supabase
        .from('app_settings')
        .update({ value: '' })
        .eq('key', 'homepage_video_url');

      await supabase
        .from('app_settings')
        .update({ value: '' })
        .eq('key', 'homepage_video_poster');

      setVideoUrl(null);
      setPosterUrl(null);

      toast({
        title: language === 'ms' ? 'Dipadam' : 'Deleted',
        description: language === 'ms' ? 'Video telah dipadam' : 'Video has been deleted',
      });
    } catch (error) {
      console.error('Error deleting video:', error);
      toast({
        title: language === 'ms' ? 'Ralat' : 'Error',
        description: language === 'ms' ? 'Gagal memadam video' : 'Failed to delete video',
        variant: 'destructive',
      });
    } finally {
      setIsDeletingVideo(false);
    }
  };

  const saveKey = async (keyType: 'secret' | 'restricted') => {
    const isSecret = keyType === 'secret';
    const keyState = isSecret ? secretKey : restrictedKey;
    const setKeyState = isSecret ? setSecretKey : setRestrictedKey;
    const dbKey = isSecret ? 'stripe_secret_key' : 'stripe_restricted_key';
    const prefix = isSecret ? 'sk_' : 'rk_';
    const keyName = isSecret 
      ? (language === 'ms' ? 'Kunci Rahsia' : 'Secret Key')
      : (language === 'ms' ? 'Kunci Terhad' : 'Restricted Key');

    if (!keyState.value.trim()) {
      toast({
        title: language === 'ms' ? 'Ralat' : 'Error',
        description: language === 'ms' ? `Sila masukkan ${keyName}` : `Please enter a ${keyName}`,
        variant: 'destructive',
      });
      return;
    }

    if (!keyState.value.startsWith(prefix)) {
      toast({
        title: language === 'ms' ? 'Kunci Tidak Sah' : 'Invalid Key',
        description: language === 'ms' 
          ? `${keyName} harus bermula dengan "${prefix}"` 
          : `${keyName} should start with "${prefix}"`,
        variant: 'destructive',
      });
      return;
    }

    setKeyState(prev => ({ ...prev, isSaving: true }));
    try {
      const { error } = await supabase
        .from('app_settings')
        .update({ value: keyState.value })
        .eq('key', dbKey);

      if (error) throw error;

      setKeyState(prev => ({ ...prev, hasValue: true }));
      toast({
        title: language === 'ms' ? 'Berjaya' : 'Success',
        description: language === 'ms' ? `${keyName} telah disimpan` : `${keyName} has been saved`,
      });
    } catch (error) {
      console.error('Error saving key:', error);
      toast({
        title: language === 'ms' ? 'Ralat' : 'Error',
        description: language === 'ms' ? `Gagal menyimpan ${keyName}` : `Failed to save ${keyName}`,
        variant: 'destructive',
      });
    } finally {
      setKeyState(prev => ({ ...prev, isSaving: false }));
    }
  };

  const clearKey = async (keyType: 'secret' | 'restricted') => {
    const isSecret = keyType === 'secret';
    const setKeyState = isSecret ? setSecretKey : setRestrictedKey;
    const dbKey = isSecret ? 'stripe_secret_key' : 'stripe_restricted_key';
    const keyName = isSecret 
      ? (language === 'ms' ? 'Kunci Rahsia' : 'Secret Key')
      : (language === 'ms' ? 'Kunci Terhad' : 'Restricted Key');

    setKeyState(prev => ({ ...prev, isSaving: true }));
    try {
      const { error } = await supabase
        .from('app_settings')
        .update({ value: '' })
        .eq('key', dbKey);

      if (error) throw error;

      setKeyState({ value: '', show: false, hasValue: false, isSaving: false });
      toast({
        title: language === 'ms' ? 'Dibersihkan' : 'Cleared',
        description: language === 'ms' ? `${keyName} telah dibuang` : `${keyName} has been removed`,
      });
    } catch (error) {
      console.error('Error clearing key:', error);
      toast({
        title: language === 'ms' ? 'Ralat' : 'Error',
        description: language === 'ms' ? `Gagal mengosongkan ${keyName}` : `Failed to clear ${keyName}`,
        variant: 'destructive',
      });
    } finally {
      setKeyState(prev => ({ ...prev, isSaving: false }));
    }
  };

  const maskKey = (key: string) => {
    if (!key || key.length < 12) return key;
    return key.slice(0, 7) + '•'.repeat(Math.min(key.length - 11, 20)) + key.slice(-4);
  };

  const KeyInput = ({ 
    keyType, 
    keyState, 
    setKeyState,
    placeholder,
    icon: Icon,
    title,
    description,
  }: {
    keyType: 'secret' | 'restricted';
    keyState: StripeKeyState;
    setKeyState: React.Dispatch<React.SetStateAction<StripeKeyState>>;
    placeholder: string;
    icon: React.ElementType;
    title: string;
    description: string;
  }) => (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-muted-foreground" />
        <Label className="text-base font-medium">{title}</Label>
        {keyState.hasValue ? (
          <span className="flex items-center gap-1 text-xs text-green-600 ml-auto">
            <CheckCircle className="h-3 w-3" />
            {language === 'ms' ? 'Dikonfigurasi' : 'Configured'}
          </span>
        ) : (
          <span className="flex items-center gap-1 text-xs text-amber-600 ml-auto">
            <XCircle className="h-3 w-3" />
            {language === 'ms' ? 'Belum dikonfigurasi' : 'Not configured'}
          </span>
        )}
      </div>
      
      <p className="text-sm text-muted-foreground">{description}</p>
      
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Input
            type={keyState.show ? 'text' : 'password'}
            value={keyState.show ? keyState.value : maskKey(keyState.value)}
            onChange={(e) => setKeyState(prev => ({ ...prev, value: e.target.value }))}
            placeholder={placeholder}
            className="pr-10 font-mono text-sm"
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="absolute right-0 top-0 h-full"
            onClick={() => setKeyState(prev => ({ ...prev, show: !prev.show }))}
          >
            {keyState.show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      <div className="flex gap-2">
        <Button 
          size="sm" 
          onClick={() => saveKey(keyType)} 
          disabled={keyState.isSaving}
        >
          {keyState.isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          {language === 'ms' ? 'Simpan' : 'Save'}
        </Button>
        {keyState.hasValue && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => clearKey(keyType)}
            disabled={keyState.isSaving}
          >
            {language === 'ms' ? 'Kosongkan' : 'Clear'}
          </Button>
        )}
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <SettingsIcon className="h-6 w-6" />
          {language === 'ms' ? 'Tetapan' : 'Settings'}
        </h1>
        <p className="text-muted-foreground">
          {language === 'ms' ? 'Urus tetapan aplikasi dan integrasi' : 'Manage your application settings and integrations'}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            {language === 'ms' ? 'Integrasi Stripe' : 'Stripe Integration'}
          </CardTitle>
          <CardDescription>
            {language === 'ms' 
              ? 'Konfigurasikan kunci API Stripe untuk pemprosesan pembayaran' 
              : 'Configure your Stripe API keys for payment processing'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {isLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              {language === 'ms' ? 'Memuatkan tetapan...' : 'Loading settings...'}
            </div>
          ) : (
            <>
              {/* Secret Key Section */}
              <KeyInput
                keyType="secret"
                keyState={secretKey}
                setKeyState={setSecretKey}
                placeholder="sk_live_... or sk_test_..."
                icon={Key}
                title={language === 'ms' ? 'Kunci Rahsia (Secret Key)' : 'Secret Key'}
                description={language === 'ms' 
                  ? 'Kunci rahsia mempunyai akses penuh ke akaun Stripe anda. Bermula dengan "sk_".'
                  : 'Secret key has full access to your Stripe account. Starts with "sk_".'}
              />

              <Separator />

              {/* Restricted Key Section */}
              <KeyInput
                keyType="restricted"
                keyState={restrictedKey}
                setKeyState={setRestrictedKey}
                placeholder="rk_live_... or rk_test_..."
                icon={Shield}
                title={language === 'ms' ? 'Kunci Terhad (Restricted Key)' : 'Restricted Key'}
                description={language === 'ms' 
                  ? 'Kunci terhad mempunyai kebenaran terhad untuk operasi tertentu. Bermula dengan "rk_".'
                  : 'Restricted key has limited permissions for specific operations. Starts with "rk_".'}
              />

              <Separator />

              {/* Security Notice */}
              <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
                <h4 className="font-medium text-amber-800 mb-1">
                  ⚠️ {language === 'ms' ? 'Notis Keselamatan' : 'Security Notice'}
                </h4>
                <p className="text-sm text-amber-700">
                  {language === 'ms' 
                    ? 'Kunci API anda disimpan dalam pangkalan data. Untuk keselamatan maksimum, pertimbangkan untuk menggunakan rahsia persekitaran melalui tetapan Cloud Lovable.' 
                    : 'Your API keys are stored in the database. For maximum security, consider using environment secrets through Lovable\'s Cloud settings instead.'}
                </p>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Homepage Video Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Video className="h-5 w-5" />
            {language === 'ms' ? 'Video Laman Utama' : 'Homepage Video'}
          </CardTitle>
          <CardDescription>
            {language === 'ms' 
              ? 'Muat naik video untuk dipaparkan di laman utama' 
              : 'Upload a video to display on the homepage'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Video Preview */}
          {videoUrl && (
            <div className="space-y-2">
              <Label>{language === 'ms' ? 'Pratonton Video' : 'Video Preview'}</Label>
              <div className="relative aspect-video max-w-lg overflow-hidden rounded-lg border bg-muted">
                <video
                  src={videoUrl}
                  poster={posterUrl || undefined}
                  controls
                  className="h-full w-full object-cover"
                >
                  Your browser does not support the video tag.
                </video>
              </div>
            </div>
          )}

          {/* Video Upload */}
          <div className="space-y-2">
            <Label>{language === 'ms' ? 'Muat Naik Video' : 'Upload Video'}</Label>
            <div 
              className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-muted-foreground/25 p-8 transition-colors hover:border-primary/50"
              onClick={() => videoInputRef.current?.click()}
            >
              {isUploadingVideo ? (
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              ) : (
                <Upload className="h-8 w-8 text-muted-foreground" />
              )}
              <p className="text-sm text-muted-foreground">
                {language === 'ms' 
                  ? 'Klik atau seret fail untuk muat naik' 
                  : 'Click or drag file to upload'}
              </p>
              <p className="text-xs text-muted-foreground">
                MP4, WebM, MOV ({language === 'ms' ? 'maks' : 'max'} 50MB)
              </p>
            </div>
            <input
              ref={videoInputRef}
              type="file"
              accept="video/mp4,video/webm,video/quicktime"
              onChange={handleVideoUpload}
              className="hidden"
            />
          </div>

          {/* Poster Upload */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Image className="h-4 w-4" />
              {language === 'ms' ? 'Imej Poster (Pilihan)' : 'Poster Image (Optional)'}
            </Label>
            <p className="text-sm text-muted-foreground">
              {language === 'ms' 
                ? 'Imej yang dipaparkan sebelum video dimainkan' 
                : 'Image displayed before the video plays'}
            </p>
            
            {posterUrl && (
              <div className="relative h-32 w-48 overflow-hidden rounded-lg border">
                <img 
                  src={posterUrl} 
                  alt="Video poster" 
                  className="h-full w-full object-cover" 
                />
              </div>
            )}
            
            <Button
              variant="outline"
              size="sm"
              onClick={() => posterInputRef.current?.click()}
              disabled={isUploadingPoster}
            >
              {isUploadingPoster ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Upload className="h-4 w-4 mr-2" />
              )}
              {posterUrl 
                ? (language === 'ms' ? 'Tukar Poster' : 'Change Poster')
                : (language === 'ms' ? 'Muat Naik Poster' : 'Upload Poster')}
            </Button>
            <input
              ref={posterInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={handlePosterUpload}
              className="hidden"
            />
          </div>

          <Separator />

          {/* Delete Video */}
          {videoUrl && (
            <Button
              variant="destructive"
              onClick={handleDeleteVideo}
              disabled={isDeletingVideo}
            >
              {isDeletingVideo ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4 mr-2" />
              )}
              {language === 'ms' ? 'Padam Video' : 'Delete Video'}
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
