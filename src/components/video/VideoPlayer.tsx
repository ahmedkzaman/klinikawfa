import React, { useRef, useEffect } from 'react';
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

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  const hasVideo = stream?.getVideoTracks().some(track => track.enabled);

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
              !hasVideo && 'hidden'
            )}
          />
          {!hasVideo && (
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
