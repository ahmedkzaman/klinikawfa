import { useState, useRef, useEffect } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { Button } from '@/components/ui/button';
import { Play, Pause, Volume2, VolumeX } from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';

export function VideoSection() {
  const { language } = useLanguage();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(true);
  const [isMuted, setIsMuted] = useState(true);
  const [hasInteracted, setHasInteracted] = useState(false);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [posterUrl, setPosterUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Fetch video URL from settings
  useEffect(() => {
    const fetchVideoSettings = async () => {
      try {
        const { data, error } = await supabase
          .from('app_settings')
          .select('key, value')
          .in('key', ['homepage_video_url', 'homepage_video_poster']);

        if (error) throw error;

        data?.forEach((setting) => {
          if (setting.key === 'homepage_video_url' && setting.value) {
            setVideoUrl(setting.value);
          } else if (setting.key === 'homepage_video_poster' && setting.value) {
            setPosterUrl(setting.value);
          }
        });
      } catch (error) {
        console.error('Error fetching video settings:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchVideoSettings();
  }, []);

  // Autoplay on mount (muted for browser compatibility)
  useEffect(() => {
    const video = videoRef.current;
    if (video && videoUrl) {
      video.play().catch(() => {
        // Autoplay blocked, show play button
        setIsPlaying(false);
      });
    }
  }, [videoUrl]);

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;

    if (isPlaying) {
      video.pause();
    } else {
      video.play();
    }
    setIsPlaying(!isPlaying);
    setHasInteracted(true);
  };

  const toggleMute = () => {
    const video = videoRef.current;
    if (!video) return;

    video.muted = !isMuted;
    setIsMuted(!isMuted);
    setHasInteracted(true);
  };

  const hasVideo = !!videoUrl;

  return (
    <section className="bg-foreground py-16 md:py-24">
      <div className="container">
        <div className="mb-10 text-center">
          <h2 className="mb-4 text-background">
            {language === 'ms' ? 'Lawat Klinik Kami' : 'Visit Our Clinic'}
          </h2>
          <p className="mx-auto max-w-2xl text-background/70">
            {language === 'ms'
              ? 'Lihat suasana mesra dan selesa di Klinik Awfa.'
              : 'See the friendly and comfortable atmosphere at Klinik Awfa.'}
          </p>
        </div>

        <div className="relative mx-auto max-w-4xl overflow-hidden rounded-2xl shadow-elevated">
          {/* Video container */}
          <div className="relative aspect-video bg-muted">
            {hasVideo ? (
              <>
                <video
                  ref={videoRef}
                  className="h-full w-full object-cover"
                  muted={isMuted}
                  loop
                  playsInline
                  poster={posterUrl || undefined}
                  src={videoUrl}
                >
                  Your browser does not support the video tag.
                </video>

                {/* Controls overlay */}
                <div 
                  className={cn(
                    'absolute inset-0 flex items-center justify-center bg-foreground/20 transition-opacity duration-300',
                    hasInteracted ? 'opacity-0 hover:opacity-100' : 'opacity-100'
                  )}
                >
                  <Button
                    size="lg"
                    variant="secondary"
                    className="h-16 w-16 rounded-full p-0 shadow-elevated"
                    onClick={togglePlay}
                  >
                    {isPlaying ? (
                      <Pause className="h-8 w-8" />
                    ) : (
                      <Play className="ml-1 h-8 w-8" />
                    )}
                  </Button>
                </div>

                {/* Bottom controls */}
                <div className="absolute bottom-4 right-4 flex gap-2">
                  <Button
                    size="icon"
                    variant="secondary"
                    className="h-10 w-10 rounded-full bg-background/80 backdrop-blur"
                    onClick={toggleMute}
                  >
                    {isMuted ? (
                      <VolumeX className="h-5 w-5" />
                    ) : (
                      <Volume2 className="h-5 w-5" />
                    )}
                  </Button>
                </div>
              </>
            ) : (
              /* Placeholder when no video is uploaded */
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-br from-primary/20 to-primary/10">
                <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-primary/20 text-primary">
                  <Play className="h-10 w-10" />
                </div>
                <p className="text-sm text-muted-foreground">
                  {language === 'ms' 
                    ? '📹 Video klinik akan ditambah di sini' 
                    : '📹 Clinic video will be added here'}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
