import React from 'react';
import { VideoPlayer } from './VideoPlayer';
import { CallControls } from './CallControls';
import { CallTimer } from './CallTimer';
import { ConnectionStatusIndicator, ConnectionStatus } from './ConnectionStatusIndicator';
import { cn } from '@/lib/utils';

interface MobileCallLayoutProps {
  remoteStream: MediaStream | null;
  localStream: MediaStream | null;
  remoteLabel: string;
  localLabel: string;
  timer: {
    formattedTime: string;
    totalMinutes: number;
    currentCost: number;
    additionalCost: number;
    isOverFreeTime: boolean;
  };
  freeMinutes: number;
  controls: {
    isAudioEnabled: boolean;
    isVideoEnabled: boolean;
    isConnected: boolean;
    isConnecting: boolean;
    onToggleAudio: () => void;
    onToggleVideo: () => void;
    onEndCall: () => void;
  };
  connectionStatus: ConnectionStatus;
  connectionError?: string | null;
  onRetry?: () => void;
  retryAttempt?: number;
  isStaff?: boolean;
  patientName?: string;
  roomCode?: string;
  className?: string;
}

export function MobileCallLayout({
  remoteStream,
  localStream,
  remoteLabel,
  localLabel,
  timer,
  freeMinutes,
  controls,
  connectionStatus,
  connectionError,
  onRetry,
  retryAttempt,
  isStaff = false,
  patientName,
  roomCode,
  className,
}: MobileCallLayoutProps) {
  return (
    <div className={cn('fixed inset-0 bg-background flex flex-col', className)}>
      {/* Compact Header with Timer */}
      <div className="bg-card/95 backdrop-blur-sm border-b px-4 py-2 flex items-center justify-between z-10">
        {isStaff && patientName ? (
          <div className="flex items-center gap-2 text-sm truncate">
            <span className="font-medium truncate">{patientName}</span>
            {roomCode && (
              <>
                <span className="text-muted-foreground">•</span>
                <span className="font-mono text-xs text-muted-foreground">{roomCode}</span>
              </>
            )}
          </div>
        ) : (
          <div className="w-1" />
        )}
        <CallTimer
          formattedTime={timer.formattedTime}
          totalMinutes={timer.totalMinutes}
          freeMinutes={freeMinutes}
          currentCost={timer.currentCost}
          additionalCost={timer.additionalCost}
          isOverFreeTime={timer.isOverFreeTime}
          compact
        />
      </div>

      {/* Main Video Area with PiP */}
      <div className="flex-1 relative overflow-hidden">
        {/* Remote Video - Full Screen */}
        <VideoPlayer
          stream={remoteStream}
          label={remoteLabel}
          className="absolute inset-0 w-full h-full"
        />

        {/* Local Video - Picture in Picture */}
        <div className="absolute bottom-24 right-4 w-28 h-36 sm:w-32 sm:h-44 rounded-xl overflow-hidden border-2 border-white shadow-lg z-20">
          <VideoPlayer
            stream={localStream}
            muted
            isLocal
            label=""
            showPlaceholder={false}
            className="w-full h-full"
          />
        </div>

        {/* Connection Status Overlay */}
        {!controls.isConnected && (
          <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 px-4 z-30">
            <ConnectionStatusIndicator
              status={connectionStatus}
              error={connectionError}
              onRetry={onRetry}
              isStaff={isStaff}
              retryAttempt={retryAttempt}
            />
          </div>
        )}
      </div>

      {/* Fixed Bottom Controls */}
      <div 
        className="bg-black/80 backdrop-blur-md border-t border-white/10 px-6 py-4 z-40"
        style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))' }}
      >
        <CallControls
          isAudioEnabled={controls.isAudioEnabled}
          isVideoEnabled={controls.isVideoEnabled}
          isConnected={controls.isConnected}
          isConnecting={controls.isConnecting}
          onToggleAudio={controls.onToggleAudio}
          onToggleVideo={controls.onToggleVideo}
          onEndCall={controls.onEndCall}
        />
      </div>
    </div>
  );
}
