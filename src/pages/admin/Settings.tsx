import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Settings as SettingsIcon, CreditCard, Loader2, Video, Upload, Trash2, Image } from 'lucide-react';
import { Separator } from '@/components/ui/separator';

export default function Settings() {
  const { toast } = useToast();
  const { language } = useLanguage();
  const { isAdmin } = useAuth();

  // Video upload state
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [posterUrl, setPosterUrl] = useState<string | null>(null);
  const [isUploadingVideo, setIsUploadingVideo] = useState(false);
  const [isUploadingPoster, setIsUploadingPoster] = useState(false);
  const [isDeletingVideo, setIsDeletingVideo] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const posterInputRef = useRef<HTMLInputElement>(null);

  const MAX_VIDEO_SIZE = 500 * 1024 * 1024; // 500MB
  const MAX_POSTER_SIZE = 5 * 1024 * 1024; // 5MB
  const ALLOWED_VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/quicktime'];
  const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const { data, error } = await supabase
        .from('app_settings')
        .select('key, value')
        .in('key', ['homepage_video_url', 'homepage_video_poster']);

      if (error) throw error;

      data?.forEach((setting) => {
        if (setting.key === 'homepage_video_url') {
          setVideoUrl(setting.value || null);
        } else if (setting.key === 'homepage_video_poster') {
          setPosterUrl(setting.value || null);
        }
      });
    } catch (error) {
      console.error('Error fetching settings:', error);
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
          ? 'Saiz maksimum adalah 500MB' 
          : 'Maximum size is 500MB',
        variant: 'destructive',
      });
      return;
    }

    setIsUploadingVideo(true);
    setUploadProgress(0);
    
    try {
      const ext = file.name.split('.').pop();
      const filePath = `clinic/homepage-video.${ext}`;

      // Use XMLHttpRequest for progress tracking
      const formData = new FormData();
      formData.append('', file);

      const { data: { session } } = await supabase.auth.getSession();
      
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        
        xhr.upload.addEventListener('progress', (event) => {
          if (event.lengthComputable) {
            const percent = Math.round((event.loaded / event.total) * 100);
            setUploadProgress(percent);
          }
        });

        xhr.addEventListener('load', () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve();
          } else {
            reject(new Error(`Upload failed with status ${xhr.status}`));
          }
        });

        xhr.addEventListener('error', () => reject(new Error('Upload failed')));
        xhr.addEventListener('abort', () => reject(new Error('Upload aborted')));

        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        xhr.open('POST', `${supabaseUrl}/storage/v1/object/videos/${filePath}`);
        xhr.setRequestHeader('Authorization', `Bearer ${session?.access_token}`);
        xhr.setRequestHeader('x-upsert', 'true');
        xhr.send(file);
      });

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
      setUploadProgress(0);
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

      {/* Stripe Integration - Admin Only */}
      {isAdmin && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              {language === 'ms' ? 'Integrasi Stripe' : 'Stripe Integration'}
            </CardTitle>
            <CardDescription>
              {language === 'ms'
                ? 'Kelayakan Stripe diurus secara selamat melalui Rahsia Cloud Lovable'
                : 'Stripe credentials are managed securely through Lovable Cloud Secrets'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
              <h4 className="mb-1 font-medium text-emerald-800">
                {language === 'ms' ? 'Diurus Dengan Selamat' : 'Securely Managed'}
              </h4>
              <p className="text-sm text-emerald-700">
                {language === 'ms'
                  ? 'Nilai rahsia tidak pernah dimuatkan ke dalam pelayar atau disimpan dalam pangkalan data aplikasi.'
                  : 'Secret values are never loaded into the browser or stored in the application database.'}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

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
              className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-8 transition-colors ${
                isUploadingVideo 
                  ? 'border-primary/50 bg-primary/5' 
                  : 'border-muted-foreground/25 hover:border-primary/50'
              }`}
              onClick={() => !isUploadingVideo && videoInputRef.current?.click()}
            >
              {isUploadingVideo ? (
                <div className="w-full max-w-xs space-y-3">
                  <div className="flex items-center justify-center gap-2">
                    <Loader2 className="h-5 w-5 animate-spin text-primary" />
                    <span className="text-sm font-medium text-primary">
                      {language === 'ms' ? 'Memuat naik...' : 'Uploading...'}
                    </span>
                  </div>
                  <div className="space-y-1">
                    <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                      <div 
                        className="h-full bg-primary transition-all duration-300 ease-out"
                        style={{ width: `${uploadProgress}%` }}
                      />
                    </div>
                    <p className="text-center text-xs text-muted-foreground">
                      {uploadProgress}%
                    </p>
                  </div>
                </div>
              ) : (
                <>
                  <Upload className="h-8 w-8 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">
                    {language === 'ms' 
                      ? 'Klik atau seret fail untuk muat naik' 
                      : 'Click or drag file to upload'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    MP4, WebM, MOV ({language === 'ms' ? 'maks' : 'max'} 500MB)
                  </p>
                </>
              )}
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
