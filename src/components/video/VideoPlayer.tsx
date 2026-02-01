import React, { useRef, useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { User, VideoOff } from 'lucide-react';

interface VideoPlayerProps {
  stream: MediaStream | null;
  muted?: boolean;
  className?: string;
  label?: string;
  isLocal?: boolean;
  showPlaceholder?: boolean;
}

export function VideoPlayer({
  stream,
  muted = false,
  className,
  label,
  isLocal = false,
  showPlaceholder = true,
}: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [hasVideoTrack, setHasVideoTrack] = useState(false);

  useEffect(() => {
    const videoElement = videoRef.current;
    if (!videoElement || !stream) {
      setHasVideoTrack(false);
      return;
    }

    // Set the stream
    videoElement.srcObject = stream;

    // Check for video tracks
    const videoTracks = stream.getVideoTracks();
    const hasActiveVideo = videoTracks.length > 0 && videoTracks.some(t => t.readyState === 'live');
    setHasVideoTrack(hasActiveVideo);

    console.log('[VideoPlayer] Stream set:', {
      label,
      videoTracks: videoTracks.length,
      hasActiveVideo,
      trackStates: videoTracks.map(t => ({ enabled: t.enabled, readyState: t.readyState }))
    });

    // Try to play (needed for some browsers)
    const playVideo = async () => {
      try {
        await videoElement.play();
        console.log('[VideoPlayer] Video playing:', label);
      } catch (err) {
        console.warn('[VideoPlayer] Autoplay blocked, will retry on interaction:', err);
      }
    };
    playVideo();

    // Listen for track changes
    const handleTrackChange = () => {
      const currentVideoTracks = stream.getVideoTracks();
      const isActive = currentVideoTracks.length > 0 && currentVideoTracks.some(t => t.readyState === 'live');
      console.log('[VideoPlayer] Track changed:', { label, isActive });
      setHasVideoTrack(isActive);
    };

    // Listen for new tracks being added to the stream
    stream.addEventListener('addtrack', handleTrackChange);
    stream.addEventListener('removetrack', handleTrackChange);

    // Also listen to individual track events
    videoTracks.forEach(track => {
      track.addEventListener('ended', handleTrackChange);
      track.addEventListener('mute', handleTrackChange);
      track.addEventListener('unmute', handleTrackChange);
    });

    return () => {
      stream.removeEventListener('addtrack', handleTrackChange);
      stream.removeEventListener('removetrack', handleTrackChange);
      videoTracks.forEach(track => {
        track.removeEventListener('ended', handleTrackChange);
        track.removeEventListener('mute', handleTrackChange);
        track.removeEventListener('unmute', handleTrackChange);
      });
    };
  }, [stream, label]);

  return (
    <div className={cn('relative bg-muted rounded-lg overflow-hidden', className)}>
      {stream ? (
        <>
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted={muted}
            className={cn(
              'w-full h-full object-cover',
              isLocal && 'transform scale-x-[-1]',
              !hasVideoTrack && 'hidden'
            )}
          />
          {!hasVideoTrack && (
            <div className="absolute inset-0 flex items-center justify-center bg-muted">
              <div className="flex flex-col items-center gap-2 text-muted-foreground">
                <VideoOff className="h-12 w-12" />
                <span className="text-sm">Camera Off</span>
              </div>
            </div>
          )}
        </>
      ) : showPlaceholder ? (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="flex flex-col items-center gap-2 text-muted-foreground">
            <User className="h-16 w-16" />
            <span className="text-sm">{label || 'Waiting for connection...'}</span>
          </div>
        </div>
      ) : null}
      
      {label && stream && (
        <div className="absolute bottom-2 left-2 bg-black/50 text-white px-2 py-1 rounded text-sm">
          {label}
        </div>
      )}
    </div>
  );
}
