import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { MainLayout } from '@/components/layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { VideoPlayer, CallControls, CallTimer, ConnectionStatusIndicator, MobileCallLayout } from '@/components/video';
import { useWebRTC } from '@/hooks/useWebRTC';
import { useCallTimer } from '@/hooks/useCallTimer';
import { useToast } from '@/hooks/use-toast';
import { useLanguage } from '@/contexts/LanguageContext';
import { useIsMobile } from '@/hooks/use-mobile';
import { supabase } from '@/integrations/supabase/client';
import { Video, CreditCard, CheckCircle, Loader2, AlertCircle } from 'lucide-react';

type Step = 'enter-code' | 'verify-room' | 'payment' | 'waiting' | 'in-call' | 'ended';

interface RoomData {
  id: string;
  room_code: string;
  status: string;
  deposit_amount: number;
  per_minute_rate: number;
  patient_name: string;
}

export default function VideoCall() {
  const [searchParams] = useSearchParams();
  const { language } = useLanguage();
  const isMobile = useIsMobile();
  const { toast } = useToast();
  
  const [step, setStep] = useState<Step>('enter-code');
  const [roomCode, setRoomCode] = useState(searchParams.get('room') || '');
  const [roomData, setRoomData] = useState<RoomData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
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
    isStaff: false,
    onCallStarted: () => {
      timer.start();
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

  // Check for payment return
  useEffect(() => {
    const payment = searchParams.get('payment');
    const room = searchParams.get('room');
    
    if (payment === 'success' && room) {
      setRoomCode(room);
      verifyPaymentAndProceed(room);
    }
  }, [searchParams]);

  const verifyPaymentAndProceed = async (code: string) => {
    setIsLoading(true);
    try {
      const { data } = await supabase.functions.invoke('video-payment', {
        body: {},
        headers: {},
      });
      
      // Lookup room again
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/video-room?action=lookup&code=${code}`,
        { headers: { 'Content-Type': 'application/json' } }
      );
      
      const result = await response.json();
      if (result.room) {
        setRoomData(result.room);
        if (result.room.status === 'paid' || result.room.status === 'active' || result.room.status === 'test') {
          setStep('waiting');
        }
      }
    } finally {
      setIsLoading(false);
    }
  };

  const lookupRoom = async () => {
    if (!roomCode.trim()) {
      toast({
        title: language === 'ms' ? 'Ralat' : 'Error',
        description: language === 'ms' ? 'Sila masukkan kod bilik' : 'Please enter room code',
        variant: 'destructive',
      });
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/video-room?action=lookup&code=${roomCode.toUpperCase()}`,
        { headers: { 'Content-Type': 'application/json' } }
      );
      
      const result = await response.json();
      
      if (!response.ok) {
        throw new Error(result.error || 'Room not found');
      }

      setRoomData(result.room);
      
      if (result.room.status === 'pending') {
        setStep('payment');
      } else if (result.room.status === 'paid' || result.room.status === 'active' || result.room.status === 'test') {
        setStep('waiting');
      } else {
        throw new Error('This room is no longer available');
      }
    } catch (error) {
      toast({
        title: language === 'ms' ? 'Ralat' : 'Error',
        description: error instanceof Error ? error.message : 'Failed to find room',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const initiatePayment = async () => {
    if (!roomData) return;

    setIsLoading(true);
    try {
      const paymentUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/video-payment?action=create-deposit`;
      
      const response = await fetch(paymentUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ room_code: roomData.room_code }),
      });
      
      const result = await response.json();
      
      if (!response.ok) {
        throw new Error(result.error || 'Failed to create payment session');
      }
      
      if (result.url) {
        window.location.href = result.url;
      } else {
        throw new Error('Failed to create payment session');
      }
    } catch (error) {
      toast({
        title: language === 'ms' ? 'Ralat' : 'Error',
        description: error instanceof Error ? error.message : 'Failed to initiate payment',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const joinCall = async () => {
    setStep('in-call');
    await webrtc.startCall();
  };

  const handleCallEnded = useCallback((durationSeconds: number) => {
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

  const formatCurrency = (cents: number) => `RM ${(cents / 100).toFixed(2)}`;

  const renderStep = () => {
    switch (step) {
      case 'enter-code':
        return (
          <Card className="max-w-md mx-auto">
            <CardHeader className="text-center">
              <Video className="h-12 w-12 mx-auto mb-4 text-primary" />
              <CardTitle>
                {language === 'ms' ? 'Perundingan Video' : 'Video Consultation'}
              </CardTitle>
              <CardDescription>
                {language === 'ms' 
                  ? 'Masukkan kod bilik yang diberikan oleh klinik'
                  : 'Enter the room code provided by the clinic'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="roomCode">
                  {language === 'ms' ? 'Kod Bilik' : 'Room Code'}
                </Label>
                <Input
                  id="roomCode"
                  value={roomCode}
                  onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                  placeholder="ABC123"
                  className="text-center text-2xl tracking-widest font-mono"
                  maxLength={6}
                />
              </div>
              <Button 
                onClick={lookupRoom} 
                disabled={isLoading}
                className="w-full"
              >
                {isLoading ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : null}
                {language === 'ms' ? 'Teruskan' : 'Continue'}
              </Button>
            </CardContent>
          </Card>
        );

      case 'payment':
        return (
          <Card className="max-w-md mx-auto">
            <CardHeader className="text-center">
              <CreditCard className="h-12 w-12 mx-auto mb-4 text-primary" />
              <CardTitle>
                {language === 'ms' ? 'Bayaran Deposit' : 'Deposit Payment'}
              </CardTitle>
              <CardDescription>
                {language === 'ms'
                  ? 'Deposit RM50 diperlukan untuk memulakan panggilan'
                  : 'RM50 deposit required to start the call'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="bg-muted p-4 rounded-lg space-y-2">
                <div className="flex justify-between">
                  <span>{language === 'ms' ? 'Deposit' : 'Deposit'}</span>
                  <span className="font-semibold">{formatCurrency(roomData?.deposit_amount || 5000)}</span>
                </div>
                <div className="flex justify-between text-sm text-muted-foreground">
                  <span>{language === 'ms' ? 'Termasuk 10 minit pertama' : 'Includes first 10 minutes'}</span>
                </div>
                <div className="border-t pt-2 mt-2 flex justify-between text-sm">
                  <span>{language === 'ms' ? 'Caj tambahan' : 'Additional charges'}</span>
                  <span>{formatCurrency(roomData?.per_minute_rate || 500)}/min</span>
                </div>
              </div>

              <div className="text-sm text-muted-foreground text-center">
                {language === 'ms'
                  ? 'Anda akan dialihkan ke halaman pembayaran selamat'
                  : 'You will be redirected to a secure payment page'}
              </div>

              <Button 
                onClick={initiatePayment} 
                disabled={isLoading}
                className="w-full"
                size="lg"
              >
                {isLoading ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : null}
                {language === 'ms' ? 'Bayar Sekarang' : 'Pay Now'}
              </Button>
            </CardContent>
          </Card>
        );

      case 'waiting':
        return (
          <Card className="max-w-md mx-auto">
            <CardHeader className="text-center">
              <CheckCircle className="h-12 w-12 mx-auto mb-4 text-green-600" />
              <CardTitle>
                {language === 'ms' ? 'Pembayaran Berjaya!' : 'Payment Successful!'}
              </CardTitle>
              <CardDescription>
                {language === 'ms'
                  ? 'Anda kini boleh menyertai panggilan video'
                  : 'You can now join the video call'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="bg-muted p-4 rounded-lg text-center">
                <div className="text-sm text-muted-foreground mb-1">
                  {language === 'ms' ? 'Kod Bilik' : 'Room Code'}
                </div>
                <div className="text-2xl font-mono font-bold">
                  {roomData?.room_code}
                </div>
              </div>

              <Button 
                onClick={joinCall}
                className="w-full"
                size="lg"
              >
                <Video className="h-4 w-4 mr-2" />
                {language === 'ms' ? 'Sertai Panggilan' : 'Join Call'}
              </Button>
            </CardContent>
          </Card>
        );

      case 'in-call':
        // Mobile layout with fixed controls and PiP
        if (isMobile) {
          return (
            <MobileCallLayout
              remoteStream={webrtc.remoteStream}
              localStream={webrtc.localStream}
              remoteLabel={language === 'ms' ? 'Doktor' : 'Doctor'}
              localLabel={language === 'ms' ? 'Anda' : 'You'}
              timer={{
                formattedTime: timer.formattedTime,
                totalMinutes: timer.totalMinutes,
                currentCost: timer.currentCost,
                additionalCost: timer.additionalCost,
                isOverFreeTime: timer.isOverFreeTime,
              }}
              freeMinutes={10}
              controls={{
                isAudioEnabled: webrtc.isAudioEnabled,
                isVideoEnabled: webrtc.isVideoEnabled,
                isConnected: webrtc.isConnected,
                isConnecting: webrtc.isConnecting,
                onToggleAudio: webrtc.toggleAudio,
                onToggleVideo: webrtc.toggleVideo,
                onEndCall: webrtc.endCall,
              }}
              connectionStatus={webrtc.connectionStatus}
              connectionError={webrtc.connectionError}
              onRetry={webrtc.retryCall}
              retryAttempt={webrtc.retryAttempt}
              isStaff={false}
            />
          );
        }

        // Desktop layout
        return (
          <div className="h-[calc(100vh-200px)] flex flex-col">
            {/* Timer */}
            <div className="bg-card border-b p-4">
              <CallTimer
                formattedTime={timer.formattedTime}
                totalMinutes={timer.totalMinutes}
                freeMinutes={10}
                currentCost={timer.currentCost}
                additionalCost={timer.additionalCost}
                isOverFreeTime={timer.isOverFreeTime}
              />
            </div>

            {/* Video Grid */}
            <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4 p-4">
              <VideoPlayer
                stream={webrtc.remoteStream}
                label={language === 'ms' ? 'Doktor' : 'Doctor'}
                className="h-full min-h-[300px]"
              />
              <VideoPlayer
                stream={webrtc.localStream}
                muted
                isLocal
                label={language === 'ms' ? 'Anda' : 'You'}
                className="h-full min-h-[300px]"
              />
            </div>

            {/* Controls */}
            <div className="bg-card border-t p-4">
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
                    isStaff={false}
                    retryAttempt={webrtc.retryAttempt}
                  />
                </div>
              )}
            </div>
          </div>
        );

      case 'ended':
        return (
          <Card className="max-w-md mx-auto">
            <CardHeader className="text-center">
              <CheckCircle className="h-12 w-12 mx-auto mb-4 text-green-600" />
              <CardTitle>
                {language === 'ms' ? 'Panggilan Tamat' : 'Call Ended'}
              </CardTitle>
              <CardDescription>
                {language === 'ms'
                  ? 'Terima kasih atas perundingan anda'
                  : 'Thank you for your consultation'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
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
                      <span>{language === 'ms' ? 'Caj Tambahan' : 'Additional Charges'}</span>
                      <span>{formatCurrency(callEndedData.additionalCost)}</span>
                    </div>
                  )}
                  <div className="border-t pt-2 mt-2 flex justify-between font-semibold">
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
                      ? 'Caj tambahan akan dikenakan. Sila hubungi klinik untuk pembayaran.'
                      : 'Additional charges apply. Please contact the clinic for payment.'}
                  </p>
                </div>
              )}

              <Button 
                onClick={() => window.location.href = '/'}
                variant="outline"
                className="w-full"
              >
                {language === 'ms' ? 'Kembali ke Laman Utama' : 'Back to Home'}
              </Button>
            </CardContent>
          </Card>
        );

      default:
        return null;
    }
  };

  return (
    <MainLayout>
      <div className="container mx-auto py-8 px-4">
        {renderStep()}
      </div>
    </MainLayout>
  );
}
