import React from 'react';
import { Button } from '@/components/ui/button';
import { Mic, MicOff, Video, VideoOff, PhoneOff, Phone } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CallControlsProps {
  isAudioEnabled: boolean;
  isVideoEnabled: boolean;
  isConnected: boolean;
  isConnecting: boolean;
  onToggleAudio: () => void;
  onToggleVideo: () => void;
  onEndCall: () => void;
  onStartCall?: () => void;
  showStartButton?: boolean;
  className?: string;
}

export function CallControls({
  isAudioEnabled,
  isVideoEnabled,
  isConnected,
  isConnecting,
  onToggleAudio,
  onToggleVideo,
  onEndCall,
  onStartCall,
  showStartButton = false,
  className,
}: CallControlsProps) {
  return (
    <div className={cn('flex items-center justify-center gap-4', className)}>
      <Button
        variant="outline"
        size="icon"
        onClick={onToggleAudio}
        disabled={!isConnected && !isConnecting}
        className={cn(
          'h-12 w-12 rounded-full',
          !isAudioEnabled && 'bg-destructive text-destructive-foreground hover:bg-destructive/90'
        )}
      >
        {isAudioEnabled ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}
      </Button>

      <Button
        variant="outline"
        size="icon"
        onClick={onToggleVideo}
        disabled={!isConnected && !isConnecting}
        className={cn(
          'h-12 w-12 rounded-full',
          !isVideoEnabled && 'bg-destructive text-destructive-foreground hover:bg-destructive/90'
        )}
      >
        {isVideoEnabled ? <Video className="h-5 w-5" /> : <VideoOff className="h-5 w-5" />}
      </Button>

      {showStartButton && onStartCall && !isConnected && !isConnecting ? (
        <Button
          onClick={onStartCall}
          className="h-12 px-6 rounded-full bg-green-600 hover:bg-green-700"
        >
          <Phone className="h-5 w-5 mr-2" />
          Start Call
        </Button>
      ) : (
        <Button
          variant="destructive"
          size="icon"
          onClick={onEndCall}
          disabled={!isConnected && !isConnecting}
          className="h-14 w-14 rounded-full"
        >
          <PhoneOff className="h-6 w-6" />
        </Button>
      )}
    </div>
  );
}
