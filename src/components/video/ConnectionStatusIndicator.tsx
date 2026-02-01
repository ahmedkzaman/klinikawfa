import React from 'react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { useLanguage } from '@/contexts/LanguageContext';
import { Loader2, AlertCircle, CheckCircle2, Wifi, Video, Users } from 'lucide-react';
import { cn } from '@/lib/utils';

export type ConnectionStatus = 
  | 'idle'
  | 'initializing-media'
  | 'connecting-to-room'
  | 'retrying'
  | 'waiting-for-peer'
  | 'establishing-connection'
  | 'connected'
  | 'failed'
  | 'disconnected';

interface ConnectionStatusIndicatorProps {
  status: ConnectionStatus;
  error: string | null;
  onRetry: () => void;
  isStaff: boolean;
  retryAttempt?: number;
  className?: string;
}

const STATUS_STEPS: ConnectionStatus[] = [
  'initializing-media',
  'connecting-to-room',
  'retrying',
  'waiting-for-peer',
  'establishing-connection',
  'connected',
];

export function ConnectionStatusIndicator({
  status,
  error,
  onRetry,
  isStaff,
  retryAttempt = 0,
  className,
}: ConnectionStatusIndicatorProps) {
  const { language } = useLanguage();
  const maxRetries = 3;

  const getStatusMessage = () => {
    const messages: Record<ConnectionStatus, { en: string; ms: string }> = {
      'idle': { en: 'Ready to connect', ms: 'Sedia untuk sambung' },
      'initializing-media': { en: 'Initializing camera and microphone...', ms: 'Memulakan kamera dan mikrofon...' },
      'connecting-to-room': { en: 'Connecting to room...', ms: 'Menyambung ke bilik...' },
      'retrying': { 
        en: `Retrying connection (${retryAttempt + 1}/${maxRetries})...`, 
        ms: `Cuba semula sambungan (${retryAttempt + 1}/${maxRetries})...` 
      },
      'waiting-for-peer': { 
        en: isStaff ? 'Waiting for patient to join...' : 'Waiting for doctor to join...', 
        ms: isStaff ? 'Menunggu pesakit menyertai...' : 'Menunggu doktor menyertai...' 
      },
      'establishing-connection': { en: 'Establishing connection...', ms: 'Mewujudkan sambungan...' },
      'connected': { en: 'Connected!', ms: 'Bersambung!' },
      'failed': { en: 'Connection failed', ms: 'Sambungan gagal' },
      'disconnected': { en: 'Disconnected', ms: 'Terputus' },
    };

    return messages[status]?.[language === 'ms' ? 'ms' : 'en'] || '';
  };

  const getStatusIcon = () => {
    switch (status) {
      case 'initializing-media':
        return <Video className="h-5 w-5" />;
      case 'connecting-to-room':
        return <Wifi className="h-5 w-5" />;
      case 'retrying':
        return <Loader2 className="h-5 w-5 animate-spin text-amber-500" />;
      case 'waiting-for-peer':
        return <Users className="h-5 w-5" />;
      case 'establishing-connection':
        return <Loader2 className="h-5 w-5 animate-spin" />;
      case 'connected':
        return <CheckCircle2 className="h-5 w-5 text-green-500" />;
      case 'failed':
      case 'disconnected':
        return <AlertCircle className="h-5 w-5 text-destructive" />;
      default:
        return <Loader2 className="h-5 w-5 animate-spin" />;
    }
  };

  const getProgress = () => {
    const currentIndex = STATUS_STEPS.indexOf(status);
    if (currentIndex === -1) {
      if (status === 'failed' || status === 'disconnected') return 0;
      return 0;
    }
    return ((currentIndex + 1) / STATUS_STEPS.length) * 100;
  };

  const isError = status === 'failed' || status === 'disconnected';
  const isSuccess = status === 'connected';
  const isLoading = !isError && !isSuccess && status !== 'idle';

  if (status === 'idle') return null;

  return (
    <div className={cn("text-center space-y-4", className)}>
      {/* Progress Bar */}
      {!isError && (
        <div className="w-full max-w-xs mx-auto">
          <Progress 
            value={getProgress()} 
            className={cn(
              "h-2",
              isSuccess && "[&>div]:bg-green-500"
            )}
          />
        </div>
      )}

      {/* Status Icon and Message */}
      <div className="flex flex-col items-center gap-2">
        <div className={cn(
          "p-3 rounded-full",
          isError && "bg-destructive/10",
          isSuccess && "bg-green-500/10",
          status === 'retrying' && "bg-amber-500/10",
          isLoading && status !== 'retrying' && "bg-primary/10"
        )}>
          {getStatusIcon()}
        </div>
        
        <p className={cn(
          "text-sm font-medium",
          isError && "text-destructive",
          isSuccess && "text-green-600"
        )}>
          {getStatusMessage()}
        </p>

        {/* Error Details */}
        {isError && error && (
          <p className="text-xs text-muted-foreground max-w-xs">
            {error}
          </p>
        )}

        {/* Loading Animation for waiting states */}
        {isLoading && (
          <div className="flex gap-1">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="w-2 h-2 bg-primary rounded-full animate-bounce"
                style={{ animationDelay: `${i * 0.15}s` }}
              />
            ))}
          </div>
        )}
      </div>

      {/* Retry Button */}
      {isError && (
        <Button onClick={onRetry} variant="default" size="lg" className="mt-4">
          {language === 'ms' ? 'Cuba Lagi' : 'Try Again'}
        </Button>
      )}
    </div>
  );
}
