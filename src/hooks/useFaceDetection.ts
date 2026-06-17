import { useState, useRef, useCallback, useEffect } from 'react';

export type FaceDetectionState = 'idle' | 'loading' | 'no-camera' | 'detecting' | 'face-found' | 'verified' | 'timeout';

interface UseFaceDetectionOptions {
  requiredBlinks?: number;
  timeoutSeconds?: number;
  onVerified?: () => void;
}

interface UseFaceDetectionReturn {
  state: FaceDetectionState;
  blinkCount: number;
  currentEAR: number | null;
  videoRef: React.RefObject<HTMLVideoElement>;
  canvasRef: React.RefObject<HTMLCanvasElement>;
  start: () => Promise<void>;
  stop: () => void;
  reset: () => void;
  error: string | null;
}

const BLINK_THRESHOLD = 0.28;
const CONSECUTIVE_FRAMES_REQUIRED = 2;
const MODEL_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.12/model';

const calculateEAR = (eye: Array<{ x: number; y: number }>) => {
  const dist = (p1: { x: number; y: number }, p2: { x: number; y: number }) =>
    Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2));
  const vertical1 = dist(eye[1], eye[5]);
  const vertical2 = dist(eye[2], eye[4]);
  const horizontal = dist(eye[0], eye[3]);
  return (vertical1 + vertical2) / (2 * horizontal);
};

export function useFaceDetection(options: UseFaceDetectionOptions = {}): UseFaceDetectionReturn {
  const { requiredBlinks = 2, timeoutSeconds = 15, onVerified } = options;

  const [state, setState] = useState<FaceDetectionState>('idle');
  const [blinkCount, setBlinkCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [currentEAR, setCurrentEAR] = useState<number | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationRef = useRef<number | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const eyeClosedRef = useRef<boolean>(false);
  const consecutiveClosedFramesRef = useRef<number>(0);
  const faceapiRef = useRef<typeof import('face-api.js') | null>(null);
  const modelsLoadedRef = useRef<boolean>(false);
  const stateRef = useRef<FaceDetectionState>('idle');

  useEffect(() => { stateRef.current = state; }, [state]);

  const stop = useCallback(() => {
    if (animationRef.current) { cancelAnimationFrame(animationRef.current); animationRef.current = null; }
    if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null; }
    if (streamRef.current) { streamRef.current.getTracks().forEach(track => track.stop()); streamRef.current = null; }
    if (videoRef.current) { videoRef.current.srcObject = null; }
  }, []);

  const reset = useCallback(() => {
    stop();
    setState('idle');
    setBlinkCount(0);
    setError(null);
    setCurrentEAR(null);
    eyeClosedRef.current = false;
    consecutiveClosedFramesRef.current = 0;
  }, [stop]);

  const detectFaces = useCallback(async () => {
    const faceapi = faceapiRef.current;
    if (!videoRef.current || !canvasRef.current || !faceapi) return;
    if (stateRef.current === 'verified' || stateRef.current === 'timeout') return;

    const video = videoRef.current;
    const canvas = canvasRef.current;

    if (video.readyState !== 4) { animationRef.current = requestAnimationFrame(detectFaces); return; }

    try {
      const detections = await faceapi.detectSingleFace(video, new faceapi.TinyFaceDetectorOptions()).withFaceLandmarks();
      const ctx = canvas.getContext('2d');
      if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);

      if (detections) {
        if (stateRef.current === 'detecting') setState('face-found');
        if (ctx) {
          const dims = faceapi.matchDimensions(canvas, video, true);
          const resizedDetections = faceapi.resizeResults(detections, dims);
          faceapi.draw.drawFaceLandmarks(canvas, resizedDetections);
        }
        const landmarks = detections.landmarks;
        const leftEAR = calculateEAR(landmarks.getLeftEye());
        const rightEAR = calculateEAR(landmarks.getRightEye());
        const avgEAR = (leftEAR + rightEAR) / 2;
        setCurrentEAR(avgEAR);

        if (avgEAR < BLINK_THRESHOLD) {
          consecutiveClosedFramesRef.current++;
          if (consecutiveClosedFramesRef.current >= CONSECUTIVE_FRAMES_REQUIRED && !eyeClosedRef.current) {
            eyeClosedRef.current = true;
          }
        } else {
          if (eyeClosedRef.current) {
            eyeClosedRef.current = false;
            setBlinkCount(prev => {
              const newCount = prev + 1;
              if (newCount >= requiredBlinks) { setState('verified'); onVerified?.(); }
              return newCount;
            });
          }
          consecutiveClosedFramesRef.current = 0;
        }
      } else {
        if (stateRef.current === 'face-found') setState('detecting');
      }
    } catch (err) { console.error('Detection error:', err); }

    animationRef.current = requestAnimationFrame(detectFaces);
  }, [requiredBlinks, onVerified]);

  const start = useCallback(async () => {
    setError(null);
    setState('loading');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } } });
      streamRef.current = stream;
      if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play(); }
      if (!faceapiRef.current) { const faceapi = await import('face-api.js'); faceapiRef.current = faceapi; }
      if (!modelsLoadedRef.current && faceapiRef.current) {
        await Promise.all([
          faceapiRef.current.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
          faceapiRef.current.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
        ]);
        modelsLoadedRef.current = true;
      }
      setState('detecting');
      setBlinkCount(0);
      animationRef.current = requestAnimationFrame(detectFaces);
      timeoutRef.current = setTimeout(() => { if (stateRef.current !== 'verified') { setState('timeout'); stop(); } }, timeoutSeconds * 1000);
    } catch (err) {
      if (err instanceof Error) {
        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') { setState('no-camera'); setError('Camera access denied.'); }
        else { setError(err.message); setState('idle'); }
      } else { setError('Failed to start face detection'); setState('idle'); }
    }
  }, [detectFaces, stop, timeoutSeconds]);

  useEffect(() => { return () => { stop(); }; }, [stop]);

  return { state, blinkCount, currentEAR, videoRef, canvasRef, start, stop, reset, error };
}
