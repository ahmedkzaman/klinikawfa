import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { VideoPlayer, CallControls, CallTimer, ConnectionStatusIndicator } from '@/components/video';
import { useWebRTC } from '@/hooks/useWebRTC';
import { useCallTimer } from '@/hooks/useCallTimer';
import { useToast } from '@/hooks/use-toast';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Video, Loader2, AlertCircle, ArrowLeft } from 'lucide-react';

type Step = 'loading' | 'ready' | 'in-call' | 'ended';

interface RoomData {
  id: string;
  room_code: string;
  status: string;
  deposit_amount: number;
  per_minute_rate: number;
  patient_name: string;
}

export default function VideoCallStaff() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { language } = useLanguage();
  const { toast } = useToast();
  const { user, isStaffOrAdmin, isAdmin, loading: authLoading, rolesLoading } = useAuth();
  
  const roomCode = searchParams.get('room') || '';
  const [step, setStep] = useState<Step>('loading');
  const [roomData, setRoomData] = useState<RoomData | null>(null);
  const [callEndedData, setCallEndedData] = useState<{
    totalMinutes: number;
    additionalCost: number;
    totalCost: number;
  } | null>(null);

  const timer = useCallTimer({
    depositAmount: roomData?.deposit_amount || 5000,
    perMinuteRate: roomData?.per_minute_rate || 500,
    freeMinutes: 10,
  });

  const webrtc = useWebRTC({
    roomCode: roomData?.room_code || '',
    isStaff: true,
    onCallStarted: () => {
      timer.start();
      updateRoomStatus('active');
    },
    onCallEnded: () => {
      const finalSeconds = timer.stop();
      handleCallEnded(finalSeconds);
    },
    onError: (error) => {
      toast({
        title: language === 'ms' ? 'Ralat' : 'Error',
        description: error,
        variant: 'destructive',
      });
    },
  });

  const updateRoomStatus = async (status: string, durationSeconds?: number) => {
    if (!roomData) return;
    
    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session.session) return;

      const body: Record<string, unknown> = {
        room_id: roomData.id,
        status,
      };

      if (status === 'active') {
        body.call_started_at = new Date().toISOString();
      } else if (status === 'ended' && durationSeconds !== undefined) {
        body.call_ended_at = new Date().toISOString();
        body.total_duration_seconds = durationSeconds;
      }

      await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/video-room?action=update-status`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        }
      );
    } catch (error) {
      console.error('Failed to update room status:', error);
    }
  };

  const handleCallEnded = useCallback(async (durationSeconds: number) => {
    await updateRoomStatus('ended', durationSeconds);

    const totalMinutes = Math.ceil(durationSeconds / 60);
    const freeMinutes = 10;
    const chargeableMinutes = Math.max(0, totalMinutes - freeMinutes);
    const perMinuteRate = roomData?.per_minute_rate || 500;
    const depositAmount = roomData?.deposit_amount || 5000;
    const additionalCost = chargeableMinutes * perMinuteRate;
    
    setCallEndedData({
      totalMinutes,
      additionalCost,
      totalCost: depositAmount + additionalCost,
    });
    setStep('ended');
  }, [roomData]);

  useEffect(() => {
    const loadRoom = async () => {
      // Wait for auth and roles to fully load before checking permissions
      if (authLoading || rolesLoading) return;

      if (!roomCode) {
        toast({
          title: 'Error',
          description: 'No room code provided',
          variant: 'destructive',
        });
        navigate('/admin/video-calls');
        return;
      }

      if (!isStaffOrAdmin) {
        toast({
          title: 'Error',
          description: 'Staff access required',
          variant: 'destructive',
        });
        navigate('/admin');
        return;
      }

      try {
        const response = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/video-room?action=lookup&code=${roomCode}`,
          { headers: { 'Content-Type': 'application/json' } }
        );
        
        const result = await response.json();
        
        if (!response.ok || !result.room) {
          throw new Error(result.error || 'Room not found');
        }

        setRoomData(result.room);
        setStep('ready');
      } catch (error) {
        toast({
          title: 'Error',
          description: error instanceof Error ? error.message : 'Failed to load room',
          variant: 'destructive',
        });
        navigate('/admin/video-calls');
      }
    };

    loadRoom();
  }, [roomCode, isStaffOrAdmin, authLoading, rolesLoading]);

  const startCall = async () => {
    setStep('in-call');
    await webrtc.startCall();
  };

  const formatCurrency = (cents: number) => `RM ${(cents / 100).toFixed(2)}`;

  if (step === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (step === 'ready') {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            <Video className="h-12 w-12 mx-auto mb-4 text-primary" />
            <CardTitle>
              {language === 'ms' ? 'Bilik Video Siap' : 'Video Room Ready'}
            </CardTitle>
            <CardDescription>
              {language === 'ms'
                ? 'Pesakit sudah membayar deposit. Klik untuk memulakan panggilan.'
                : 'Patient has paid the deposit. Click to start the call.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="bg-muted p-4 rounded-lg">
              <div className="text-sm text-muted-foreground mb-1">
                {language === 'ms' ? 'Pesakit' : 'Patient'}
              </div>
              <div className="font-semibold text-lg">{roomData?.patient_name}</div>
              <div className="text-sm text-muted-foreground mt-2">
                {language === 'ms' ? 'Kod Bilik' : 'Room Code'}: 
                <span className="font-mono font-bold ml-2">{roomData?.room_code}</span>
              </div>
            </div>

            <Button onClick={startCall} className="w-full" size="lg">
              <Video className="h-5 w-5 mr-2" />
              {language === 'ms' ? 'Mulakan Panggilan' : 'Start Call'}
            </Button>

            <Button 
              variant="outline" 
              className="w-full"
              onClick={() => navigate('/admin/video-calls')}
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              {language === 'ms' ? 'Kembali' : 'Back'}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (step === 'in-call') {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        {/* Header with Timer */}
        <div className="bg-card border-b p-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="font-semibold">{roomData?.patient_name}</div>
            <span className="text-muted-foreground">|</span>
            <span className="font-mono">{roomData?.room_code}</span>
          </div>
          <CallTimer
            formattedTime={timer.formattedTime}
            totalMinutes={timer.totalMinutes}
            freeMinutes={10}
            currentCost={timer.currentCost}
            additionalCost={timer.additionalCost}
            isOverFreeTime={timer.isOverFreeTime}
            className="flex-row gap-4"
          />
        </div>

        {/* Video Grid */}
        <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4 p-4">
          <VideoPlayer
            stream={webrtc.remoteStream}
            label={roomData?.patient_name || 'Patient'}
            className="h-full min-h-[400px]"
          />
          <VideoPlayer
            stream={webrtc.localStream}
            muted
            isLocal
            label={language === 'ms' ? 'Anda (Doktor)' : 'You (Doctor)'}
            className="h-full min-h-[400px]"
          />
        </div>

        {/* Controls */}
        <div className="bg-card border-t p-6">
          <CallControls
            isAudioEnabled={webrtc.isAudioEnabled}
            isVideoEnabled={webrtc.isVideoEnabled}
            isConnected={webrtc.isConnected}
            isConnecting={webrtc.isConnecting}
            onToggleAudio={webrtc.toggleAudio}
            onToggleVideo={webrtc.toggleVideo}
            onEndCall={webrtc.endCall}
          />
          {!webrtc.isConnected && (
            <div className="mt-4">
              <ConnectionStatusIndicator
                status={webrtc.connectionStatus}
                error={webrtc.connectionError}
                onRetry={webrtc.retryCall}
                isStaff={true}
                retryAttempt={webrtc.retryAttempt}
              />
            </div>
          )}
        </div>
      </div>
    );
  }

  if (step === 'ended') {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            <Video className="h-12 w-12 mx-auto mb-4 text-green-600" />
            <CardTitle>
              {language === 'ms' ? 'Panggilan Tamat' : 'Call Ended'}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-center mb-4">
              <div className="text-muted-foreground">
                {language === 'ms' ? 'Pesakit' : 'Patient'}
              </div>
              <div className="font-semibold text-lg">{roomData?.patient_name}</div>
            </div>

            {callEndedData && (
              <div className="bg-muted p-4 rounded-lg space-y-2">
                <div className="flex justify-between">
                  <span>{language === 'ms' ? 'Tempoh' : 'Duration'}</span>
                  <span className="font-semibold">{callEndedData.totalMinutes} min</span>
                </div>
                <div className="flex justify-between">
                  <span>{language === 'ms' ? 'Deposit' : 'Deposit'}</span>
                  <span>{formatCurrency(roomData?.deposit_amount || 5000)}</span>
                </div>
                {callEndedData.additionalCost > 0 && (
                  <div className="flex justify-between text-amber-600">
                    <span>{language === 'ms' ? 'Caj Tambahan' : 'Additional'}</span>
                    <span>{formatCurrency(callEndedData.additionalCost)}</span>
                  </div>
                )}
                <div className="border-t pt-2 mt-2 flex justify-between font-semibold text-lg">
                  <span>{language === 'ms' ? 'Jumlah' : 'Total'}</span>
                  <span>{formatCurrency(callEndedData.totalCost)}</span>
                </div>
              </div>
            )}

            {callEndedData && callEndedData.additionalCost > 0 && (
              <div className="flex items-start gap-2 text-amber-600 bg-amber-50 p-3 rounded-lg">
                <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
                <p className="text-sm">
                  {language === 'ms'
                    ? 'Pesakit perlu membayar caj tambahan.'
                    : 'Patient needs to pay additional charges.'}
                </p>
              </div>
            )}

            <Button 
              onClick={() => navigate('/admin/video-calls')}
              className="w-full"
            >
              {language === 'ms' ? 'Kembali ke Dashboard' : 'Back to Dashboard'}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return null;
}
