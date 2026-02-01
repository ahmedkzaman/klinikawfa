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

    // Check for video tracks - be lenient for remote streams
    const videoTracks = stream.getVideoTracks();
    // For remote streams, tracks may not be 'live' immediately
    // Accept tracks that exist and are not explicitly ended
    const hasActiveVideo = videoTracks.length > 0 && videoTracks.some(t => t.readyState !== 'ended');
    setHasVideoTrack(hasActiveVideo);

    console.log('[VideoPlayer] Stream set:', {
      label,
      isLocal,
      videoTracks: videoTracks.length,
      hasActiveVideo,
      trackStates: videoTracks.map(t => ({ enabled: t.enabled, readyState: t.readyState, muted: t.muted }))
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

    // Handle video element events for remote streams
    const handleLoadedMetadata = () => {
      console.log('[VideoPlayer] Video metadata loaded:', label);
      setHasVideoTrack(true);
      playVideo();
    };

    const handleLoadedData = () => {
      console.log('[VideoPlayer] Video data loaded:', label);
      setHasVideoTrack(true);
    };

    const handleCanPlay = () => {
      console.log('[VideoPlayer] Video can play:', label);
      setHasVideoTrack(true);
    };

    videoElement.addEventListener('loadedmetadata', handleLoadedMetadata);
    videoElement.addEventListener('loadeddata', handleLoadedData);
    videoElement.addEventListener('canplay', handleCanPlay);

    // Initial play attempt
    playVideo();

    // For remote streams, add a delayed re-check to handle async track initialization
    let checkInterval: ReturnType<typeof setInterval> | null = null;
    if (!isLocal) {
      let checkCount = 0;
      const maxChecks = 6; // Check for 3 seconds (every 500ms)
      
      checkInterval = setInterval(() => {
        checkCount++;
        const currentTracks = stream.getVideoTracks();
        const isActive = currentTracks.length > 0 && currentTracks.some(t => t.readyState !== 'ended');
        
        console.log(`[VideoPlayer] Delayed check ${checkCount}/${maxChecks}:`, {
          label,
          tracks: currentTracks.length,
          isActive,
          states: currentTracks.map(t => t.readyState)
        });
        
        if (isActive) {
          setHasVideoTrack(true);
        }
        
        if (checkCount >= maxChecks || isActive) {
          if (checkInterval) clearInterval(checkInterval);
        }
      }, 500);
    }

    // Listen for track changes
    const handleTrackChange = () => {
      const currentVideoTracks = stream.getVideoTracks();
      const isActive = currentVideoTracks.length > 0 && currentVideoTracks.some(t => t.readyState !== 'ended');
      console.log('[VideoPlayer] Track changed:', { label, isActive, trackCount: currentVideoTracks.length });
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
      if (checkInterval) clearInterval(checkInterval);
      videoElement.removeEventListener('loadedmetadata', handleLoadedMetadata);
      videoElement.removeEventListener('loadeddata', handleLoadedData);
      videoElement.removeEventListener('canplay', handleCanPlay);
      stream.removeEventListener('addtrack', handleTrackChange);
      stream.removeEventListener('removetrack', handleTrackChange);
      videoTracks.forEach(track => {
        track.removeEventListener('ended', handleTrackChange);
        track.removeEventListener('mute', handleTrackChange);
        track.removeEventListener('unmute', handleTrackChange);
      });
    };
  }, [stream, label, isLocal]);

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
