import { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useLanguage } from '@/contexts/LanguageContext';
import { Button } from '@/components/ui/button';
import { Play, Pause, Volume2, VolumeX, Film } from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import type { HomeContent } from '@/features/website-cms/schemas/home';

interface VideoSectionProps {
  content: HomeContent['video'];
  preview?: boolean;
}

export function VideoSection({ content, preview = false }: VideoSectionProps) {
  const { language } = useLanguage();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(true);
  const [isMuted, setIsMuted] = useState(true);
  const [hasInteracted, setHasInteracted] = useState(false);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [posterUrl, setPosterUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchVideoSettings = async () => {
      try {
        const { data, error } = await supabase
          .from('app_settings')
          .select('key, value')
          .in('key', [content.videoUrlSettingKey, content.posterSettingKey]);

        if (error) throw error;

        data?.forEach((setting) => {
          if (setting.key === content.videoUrlSettingKey && setting.value) {
            setVideoUrl(setting.value);
          } else if (setting.key === content.posterSettingKey && setting.value) {
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
  }, [content.posterSettingKey, content.videoUrlSettingKey]);

  useEffect(() => {
    const video = videoRef.current;
    if (video && videoUrl) {
      video.play().catch(() => {
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
  const localized = (copy: { ms: string; en: string }) =>
    language === 'ms' ? copy.ms : copy.en || copy.ms;

  return (
    <section className="relative py-20 md:py-28 bg-gradient-to-br from-foreground via-foreground to-foreground/95 overflow-hidden">
      {/* Decorative elements */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-primary/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-accent/10 rounded-full blur-3xl" />
      </div>

      <div className="container relative z-10">
        <motion.div
          initial={false}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.6 }}
          className="mb-12 text-center"
        >
          <motion.span
            initial={false}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            className="inline-flex items-center gap-2 mb-4 px-4 py-1.5 rounded-full bg-white/10 text-white/90 text-sm font-medium border border-white/20 backdrop-blur-sm"
          >
            <Film className="h-4 w-4" />
            {localized(content.eyebrow)}
          </motion.span>
          <h2 className="mb-4 text-background">
            {localized(content.title)}
          </h2>
          <p className="mx-auto max-w-2xl text-background/70 text-lg">
            {localized(content.description)}
          </p>
        </motion.div>

        <motion.div
          initial={false}
          whileInView={{ opacity: 1, y: 0, scale: 1 }}
          viewport={{ once: true, margin: "-50px" }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="relative mx-auto max-w-5xl overflow-hidden rounded-3xl shadow-elevated"
        >
          {/* Glowing border effect */}
          <div className="absolute -inset-1 bg-gradient-to-r from-primary via-accent to-primary rounded-3xl blur-lg opacity-30 animate-pulse-glow" />
          
          {/* Video container */}
          <div className="relative aspect-video bg-muted rounded-3xl overflow-hidden">
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
                  {localized(content.unsupportedMessage)}
                </video>

                {/* Controls overlay */}
                <div 
                  className={cn(
                    'absolute inset-0 flex items-center justify-center bg-foreground/30 backdrop-blur-sm transition-all duration-500',
                    hasInteracted ? 'opacity-0 hover:opacity-100' : 'opacity-100'
                  )}
                >
                  <motion.button
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={togglePlay}
                    className="flex h-20 w-20 items-center justify-center rounded-full bg-white/20 backdrop-blur-md text-white shadow-elevated hover:bg-white/30 transition-colors"
                  >
                    {isPlaying ? (
                      <Pause className="h-10 w-10" />
                    ) : (
                      <Play className="ml-1 h-10 w-10" />
                    )}
                  </motion.button>
                </div>

                {/* Bottom controls */}
                <div className="absolute bottom-6 right-6 flex gap-3">
                  <motion.button
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={toggleMute}
                    className="flex h-12 w-12 items-center justify-center rounded-full bg-white/20 backdrop-blur-md text-white hover:bg-white/30 transition-colors"
                  >
                    {isMuted ? (
                      <VolumeX className="h-5 w-5" />
                    ) : (
                      <Volume2 className="h-5 w-5" />
                    )}
                  </motion.button>
                </div>
              </>
            ) : (
              /* Placeholder when no video is uploaded */
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-br from-primary/30 to-accent/20">
                <motion.div
                  animate={{ scale: [1, 1.05, 1] }}
                  transition={{ duration: 2, repeat: Infinity }}
                  className="mb-6 flex h-24 w-24 items-center justify-center rounded-full bg-white/20 backdrop-blur-md text-white"
                >
                  <Play className="h-12 w-12" />
                </motion.div>
                <p className="text-white/80 text-lg">
                  {localized(content.placeholder)}
                </p>
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </section>
  );
}
