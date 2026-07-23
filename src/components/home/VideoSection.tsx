import { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useLanguage } from '@/contexts/LanguageContext';
import { Button } from '@/components/ui/button';
import { Play, Pause, Volume2, VolumeX } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PublicSectionHeader } from '@/components/public';
import { supabase } from '@/integrations/supabase/client';
import type { HomeContent } from '@/features/website-cms/schemas/home';

interface VideoSectionProps {
  content: HomeContent['video'];
  preview?: boolean;
}

function VideoPreviewSection({ content }: Pick<VideoSectionProps, 'content'>) {
  const { language } = useLanguage();
  const localized = (copy: { ms: string; en: string }) =>
    language === 'ms' ? copy.ms : copy.en || copy.ms;

  return (
    <section className="public-section bg-background">
      <div className="container">
        <div className="mb-10">
          <PublicSectionHeader
            align="center"
            eyebrow={localized(content.eyebrow)}
            title={localized(content.title)}
            description={localized(content.description)}
          />
        </div>

        <div className="mx-auto max-w-5xl overflow-hidden border border-border bg-muted shadow-card">
          <div className="relative aspect-video overflow-hidden">
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-primary/10">
              <div className="mb-6 flex h-20 w-20 items-center justify-center border border-primary/25 bg-background text-primary">
                <Play className="h-12 w-12" />
              </div>
              <p className="text-lg text-muted-foreground">
                {localized(content.placeholder)}
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function PublicVideoSection({ content }: Pick<VideoSectionProps, 'content'>) {
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
  const playLabel = language === 'ms' ? 'Mainkan video' : 'Play video';
  const pauseLabel = language === 'ms' ? 'Jeda video' : 'Pause video';
  const muteLabel = language === 'ms' ? 'Redam video' : 'Mute video';
  const unmuteLabel = language === 'ms' ? 'Nyahredam video' : 'Unmute video';

  return (
    <section className="public-section bg-background">
      <div className="container">
        <motion.div
          initial={false}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.6 }}
          className="mb-10"
        >
          <PublicSectionHeader
            align="center"
            eyebrow={localized(content.eyebrow)}
            title={localized(content.title)}
            description={localized(content.description)}
          />
        </motion.div>

        <motion.div
          initial={false}
          whileInView={{ opacity: 1, y: 0, scale: 1 }}
          viewport={{ once: true, margin: "-50px" }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="relative mx-auto max-w-5xl overflow-hidden border border-border bg-muted shadow-card"
        >
          <div className="relative aspect-video overflow-hidden">
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
                    'absolute inset-0 flex items-center justify-center bg-foreground/35 transition-opacity duration-300',
                    hasInteracted ? 'opacity-0 hover:opacity-100 focus-within:opacity-100' : 'opacity-100'
                  )}
                >
                  <motion.button
                    onClick={togglePlay}
                    aria-label={isPlaying ? pauseLabel : playLabel}
                    aria-pressed={!isPlaying}
                    className="flex h-20 w-20 items-center justify-center border border-white/50 bg-background/95 text-primary shadow-card hover:bg-background"
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
                    onClick={toggleMute}
                    aria-label={isMuted ? unmuteLabel : muteLabel}
                    aria-pressed={isMuted}
                    className="flex h-12 w-12 items-center justify-center border border-white/50 bg-background/95 text-primary hover:bg-background"
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
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-primary/10">
                <div className="mb-6 flex h-20 w-20 items-center justify-center border border-primary/25 bg-background text-primary">
                  <Play className="h-12 w-12" />
                </div>
                <p className="text-lg text-muted-foreground">
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

export function VideoSection({ content, preview = false }: VideoSectionProps) {
  return preview ? (
    <VideoPreviewSection content={content} />
  ) : (
    <PublicVideoSection content={content} />
  );
}
