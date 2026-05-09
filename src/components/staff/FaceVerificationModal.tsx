import { useEffect, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useFaceDetection, FaceDetectionState } from '@/hooks/useFaceDetection';
import { Loader2, Camera, Eye, CheckCircle, AlertTriangle, Play } from 'lucide-react';
import { cn } from '@/lib/utils';

interface FaceVerificationModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onVerified: () => void;
  punchType: 'in' | 'out';
}

const stateMessages: Record<FaceDetectionState, { title: string; description: string }> = {
  idle: { title: 'Ready to Verify', description: 'Click the button below to start camera and face detection.' },
  loading: { title: 'Starting Camera', description: 'Initializing camera and loading face detection...' },
  'no-camera': { title: 'Camera Access Required', description: 'Please allow camera access to verify your identity.' },
  detecting: { title: 'Looking for Face', description: 'Position your face within the frame.' },
  'face-found': { title: 'Face Detected!', description: 'Please blink twice to verify.' },
  verified: { title: 'Verified!', description: 'Face verification successful.' },
  timeout: { title: 'Verification Timeout', description: 'Could not detect blinks in time. Please try again.' },
};

const StateIcon = ({ state }: { state: FaceDetectionState }) => {
  switch (state) {
    case 'idle': return <Camera className="h-6 w-6 text-slate-500" />;
    case 'loading': return <Loader2 className="h-6 w-6 animate-spin text-slate-500" />;
    case 'no-camera': return <Camera className="h-6 w-6 text-rose-600" />;
    case 'detecting': return <Eye className="h-6 w-6 text-yellow-500 animate-pulse" />;
    case 'face-found': return <Eye className="h-6 w-6 text-blue-600" />;
    case 'verified': return <CheckCircle className="h-6 w-6 text-green-600" />;
    case 'timeout': return <AlertTriangle className="h-6 w-6 text-rose-600" />;
  }
};

export function FaceVerificationModal({ open, onOpenChange, onVerified, punchType }: FaceVerificationModalProps) {
  const { state, blinkCount, currentEAR, videoRef, canvasRef, start, stop, reset, error } = useFaceDetection({
    requiredBlinks: 2,
    timeoutSeconds: 15,
    onVerified: () => { setTimeout(() => { onVerified(); onOpenChange(false); }, 1000); },
  });

  useEffect(() => { if (!open) { stop(); reset(); } }, [open, stop, reset]);

  const handleStartCamera = useCallback(() => { start(); }, [start]);
  const handleClose = useCallback(() => { stop(); onOpenChange(false); }, [stop, onOpenChange]);

  const message = stateMessages[state];
  const showVideo = state !== 'idle';

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <StateIcon state={state} />
            Punch {punchType === 'in' ? 'In' : 'Out'} Verification
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="relative aspect-[4/3] bg-slate-100 rounded-lg overflow-hidden">
            {showVideo && (
              <>
                <video ref={videoRef} autoPlay playsInline muted className={cn("absolute inset-0 w-full h-full object-cover", "transform scale-x-[-1]")} />
                <canvas ref={canvasRef} className={cn("absolute inset-0 w-full h-full", "transform scale-x-[-1]")} />
              </>
            )}
            {state === 'idle' && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-center p-4">
                  <Camera className="h-12 w-12 mx-auto text-slate-500 mb-4" />
                  <p className="text-sm text-slate-500 mb-4">Face verification required</p>
                  <Button onClick={handleStartCamera} size="lg"><Play className="h-4 w-4 mr-2" />Start Camera</Button>
                </div>
              </div>
            )}
            {state === 'loading' && (
              <div className="absolute inset-0 flex items-center justify-center bg-background/80">
                <div className="text-center"><Loader2 className="h-8 w-8 animate-spin mx-auto text-blue-600" /><p className="text-sm text-slate-500 mt-2">Loading...</p></div>
              </div>
            )}
            {(state === 'detecting' || state === 'face-found') && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className={cn("w-48 h-64 rounded-full border-4 border-dashed", state === 'detecting' && "border-yellow-500/50", state === 'face-found' && "border-green-600")} />
              </div>
            )}
            {state === 'verified' && (
              <div className="absolute inset-0 flex items-center justify-center bg-green-600/20">
                <CheckCircle className="h-16 w-16 text-green-600" />
              </div>
            )}
            {state === 'no-camera' && (
              <div className="absolute inset-0 flex items-center justify-center"><div className="text-center p-4"><Camera className="h-12 w-12 mx-auto text-rose-600 mb-2" /><p className="text-sm text-slate-500">Camera access denied</p></div></div>
            )}
            {state === 'timeout' && (
              <div className="absolute inset-0 flex items-center justify-center bg-background/80"><div className="text-center p-4"><AlertTriangle className="h-12 w-12 mx-auto text-rose-600 mb-2" /><p className="text-sm text-slate-500">Verification timed out</p></div></div>
            )}
          </div>
          <div className="text-center">
            <h3 className="font-medium">{message.title}</h3>
            <p className="text-sm text-slate-500">{message.description}</p>
            {(state === 'face-found' || state === 'detecting') && (
              <div className="mt-2 space-y-1">
                <div className="flex items-center justify-center gap-2">
                  <span className="text-sm text-slate-500">Blinks detected:</span>
                  <div className="flex gap-1">
                    {[0, 1].map((i) => (
                      <div key={i} className={cn("w-3 h-3 rounded-full border-2", blinkCount > i ? "bg-green-600 border-green-600" : "border-muted-foreground")} />
                    ))}
                  </div>
                </div>
                {currentEAR !== null && (
                  <div className="text-xs text-slate-500 font-mono">EAR: {currentEAR.toFixed(3)} {currentEAR < 0.28 ? '👁️ closed' : '👀 open'}</div>
                )}
              </div>
            )}
            {error && <p className="text-sm text-rose-600 mt-2">{error}</p>}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={handleClose}>Cancel</Button>
            {(state === 'timeout' || state === 'no-camera') && <Button className="flex-1" onClick={handleStartCamera}>Try Again</Button>}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
