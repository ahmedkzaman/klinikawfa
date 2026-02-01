import { useState, useRef, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { RealtimeChannel } from '@supabase/supabase-js';
import type { ConnectionStatus } from '@/components/video/ConnectionStatusIndicator';

// Retry configuration for signaling channel
const MAX_RETRY_ATTEMPTS = 3;
const INITIAL_RETRY_DELAY = 2000; // 2 seconds

// Answer retry configuration
const MAX_ANSWER_RETRIES = 3;
const ANSWER_RETRY_DELAY = 1000; // 1 second base delay

// Connection timeout configuration
const CONNECTION_TIMEOUT_MS = 30000; // 30 seconds

interface UseWebRTCOptions {
  roomCode: string;
  isStaff: boolean;
  onCallStarted?: () => void;
  onCallEnded?: () => void;
  onError?: (error: string) => void;
}

interface UseWebRTCReturn {
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  isConnecting: boolean;
  isConnected: boolean;
  connectionState: string;
  connectionStatus: ConnectionStatus;
  connectionError: string | null;
  retryAttempt: number;
  startCall: () => Promise<void>;
  endCall: () => void;
  retryCall: () => Promise<void>;
  toggleAudio: () => void;
  toggleVideo: () => void;
  isAudioEnabled: boolean;
  isVideoEnabled: boolean;
}

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
];

export function useWebRTC({
  roomCode,
  isStaff,
  onCallStarted,
  onCallEnded,
  onError,
}: UseWebRTCOptions): UseWebRTCReturn {
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionState, setConnectionState] = useState('new');
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('idle');
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [retryAttempt, setRetryAttempt] = useState(0);
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);

  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const pendingCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  const currentOfferRef = useRef<RTCSessionDescriptionInit | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const offerPollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const connectionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const answerRetryCountRef = useRef<number>(0);
  const iceRestartInProgressRef = useRef<boolean>(false);

  const cleanup = useCallback(() => {
    console.log('[WebRTC] Cleaning up...');
    if (offerPollIntervalRef.current) {
      clearInterval(offerPollIntervalRef.current);
      offerPollIntervalRef.current = null;
    }
    if (connectionTimeoutRef.current) {
      clearTimeout(connectionTimeoutRef.current);
      connectionTimeoutRef.current = null;
    }
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
      localStreamRef.current = null;
    }
    if (remoteStreamRef.current) {
      remoteStreamRef.current = null;
    }
    setLocalStream(null);
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
    setRemoteStream(null);
    setIsConnecting(false);
    setIsConnected(false);
    setConnectionState('closed');
    currentOfferRef.current = null;
    pendingCandidatesRef.current = [];
    answerRetryCountRef.current = 0;
    iceRestartInProgressRef.current = false;
  }, []);

  const initializeMedia = async () => {
    try {
      console.log('[WebRTC] Initializing media devices...');
      
      // First, enumerate available devices
      const devices = await navigator.mediaDevices.enumerateDevices();
      const hasVideo = devices.some(d => d.kind === 'videoinput');
      const hasAudio = devices.some(d => d.kind === 'audioinput');
      
      console.log('[WebRTC] Available devices - Video:', hasVideo, 'Audio:', hasAudio);
      
      if (!hasVideo && !hasAudio) {
        throw new Error('No camera or microphone found. Please connect a device and try again.');
      }
      
      // Request only available device types
      const constraints = {
        video: hasVideo,
        audio: hasAudio,
      };
      
      console.log('[WebRTC] Requesting media with constraints:', constraints);
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      
      localStreamRef.current = stream;
      setLocalStream(stream);
      setIsVideoEnabled(hasVideo);
      setIsAudioEnabled(hasAudio);
      
      console.log('[WebRTC] Media initialized successfully');
      
      // Warn user if only partial devices available
      if (!hasVideo) {
        console.log('[WebRTC] No camera found, audio-only mode');
      } else if (!hasAudio) {
        console.log('[WebRTC] No microphone found, video-only mode');
      }
      
      return stream;
    } catch (err) {
      console.error('[WebRTC] Failed to get media devices:', err);
      
      // Provide specific error messages based on error type
      const error = err as Error;
      if (error.name === 'NotFoundError' || error.message.includes('Requested device not found')) {
        onError?.('Camera/microphone not found. Please connect a device and check permissions.');
      } else if (error.name === 'NotAllowedError') {
        onError?.('Camera/microphone permission denied. Please allow access in your browser settings.');
      } else if (error.name === 'NotReadableError') {
        onError?.('Camera/microphone is in use by another application. Please close other apps and try again.');
      } else if (error.name === 'OverconstrainedError') {
        onError?.('Camera/microphone settings not supported. Please try a different device.');
      } else {
        onError?.(error.message || 'Failed to access camera/microphone.');
      }
      
      throw err;
    }
  };

  const createPeerConnection = (stream: MediaStream) => {
    console.log('[WebRTC] Creating peer connection...');
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    // CRITICAL FIX: Add explicit transceivers for bidirectional media BEFORE adding tracks
    // This ensures the SDP includes "sendrecv" direction for both audio and video
    // Without this, the staff's offer may not properly negotiate receiving media from patient
    console.log('[WebRTC] Adding transceivers for bidirectional media...');
    pc.addTransceiver('audio', { direction: 'sendrecv' });
    pc.addTransceiver('video', { direction: 'sendrecv' });

    // Add local tracks
    stream.getTracks().forEach(track => {
      console.log('[WebRTC] Adding local track:', track.kind);
      pc.addTrack(track, stream);
    });

    // Initialize remote stream ref if needed
    if (!remoteStreamRef.current) {
      remoteStreamRef.current = new MediaStream();
    }

    // CRITICAL FIX: Improved ontrack handler that uses event.streams when available
    pc.ontrack = (event) => {
      console.log('[WebRTC] ontrack event:', event.track.kind, 'readyState:', event.track.readyState, 'streams:', event.streams?.length);
      
      // Prefer using the stream from the event (this is the proper way)
      if (event.streams && event.streams[0]) {
        console.log('[WebRTC] Using stream from event for', event.track.kind);
        remoteStreamRef.current = event.streams[0];
        setRemoteStream(event.streams[0]);
      } else {
        // Fallback: manually manage tracks
        const track = event.track;
        const existingTrack = remoteStreamRef.current?.getTracks().find(t => t.id === track.id);
        
        if (!existingTrack && remoteStreamRef.current) {
          console.log('[WebRTC] Adding track to managed remote stream:', track.kind);
          remoteStreamRef.current.addTrack(track);
          
          // Create new MediaStream reference to trigger React re-render
          const updatedStream = new MediaStream(remoteStreamRef.current.getTracks());
          remoteStreamRef.current = updatedStream;
          setRemoteStream(updatedStream);
        }
      }
      
      // Track lifecycle events for debugging
      event.track.onended = () => console.log('[WebRTC] Remote track ended:', event.track.kind);
      event.track.onmute = () => console.log('[WebRTC] Remote track muted:', event.track.kind);
      event.track.onunmute = () => console.log('[WebRTC] Remote track unmuted:', event.track.kind);
    };

    // Handle ICE candidates
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        console.log('[WebRTC] New ICE candidate:', event.candidate.type);
        channelRef.current?.send({
          type: 'broadcast',
          event: 'ice-candidate',
          payload: {
            candidate: event.candidate.toJSON(),
            from: isStaff ? 'staff' : 'patient',
          },
        });
      }
    };

    // Monitor connection state
    pc.onconnectionstatechange = () => {
      console.log('[WebRTC] Connection state:', pc.connectionState);
      setConnectionState(pc.connectionState);
      
      if (pc.connectionState === 'connected') {
        // Clear connection timeout on success
        if (connectionTimeoutRef.current) {
          clearTimeout(connectionTimeoutRef.current);
          connectionTimeoutRef.current = null;
        }
        setConnectionStatus('connected');
        setIsConnected(true);
        setIsConnecting(false);
        iceRestartInProgressRef.current = false;
        onCallStarted?.();
      } else if (pc.connectionState === 'connecting') {
        setConnectionStatus('establishing-connection');
      } else if (pc.connectionState === 'disconnected') {
        setConnectionStatus('disconnected');
        setIsConnected(false);
        onCallEnded?.();
      } else if (pc.connectionState === 'failed') {
        setConnectionStatus('failed');
        setConnectionError('Connection to peer failed. Please try again.');
        setIsConnected(false);
        onCallEnded?.();
      }
    };

    // ICE connection state handler with automatic ICE restart
    pc.oniceconnectionstatechange = async () => {
      console.log('[WebRTC] ICE connection state:', pc.iceConnectionState);
      
      // Attempt ICE restart on failure
      if (pc.iceConnectionState === 'failed' && !iceRestartInProgressRef.current) {
        console.log('[WebRTC] ICE failed, attempting restart...');
        iceRestartInProgressRef.current = true;
        
        try {
          pc.restartIce();
          
          // Only staff creates new offer for ICE restart
          if (isStaff) {
            const offer = await pc.createOffer({ iceRestart: true });
            await pc.setLocalDescription(offer);
            currentOfferRef.current = offer;
            
            console.log('[WebRTC] Sending ICE restart offer');
            channelRef.current?.send({
              type: 'broadcast',
              event: 'offer',
              payload: { offer, from: 'staff', iceRestart: true },
            });
          }
        } catch (err) {
          console.error('[WebRTC] ICE restart failed:', err);
          iceRestartInProgressRef.current = false;
        }
      } else if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
        iceRestartInProgressRef.current = false;
      }
    };

    peerConnectionRef.current = pc;
    return pc;
  };

  // Check if backend is reachable before attempting signaling
  const checkBackendConnectivity = async (): Promise<boolean> => {
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      
      const response = await fetch(`${supabaseUrl}/rest/v1/`, {
        method: 'HEAD',
        headers: { 
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`
        }
      });
      return response.ok || response.status === 400; // 400 is acceptable (no table specified)
    } catch (err) {
      console.error('[WebRTC] Backend connectivity check failed:', err);
      return false;
    }
  };

  const setupSignaling = (pc: RTCPeerConnection): Promise<void> => {
    return new Promise((resolve, reject) => {
      console.log('[WebRTC] Setting up signaling channel for room:', roomCode);
      
      let isResolved = false;
      let timeoutId: ReturnType<typeof setTimeout> | null = null;
      
      const channel = supabase.channel(`video-room-${roomCode}`, {
        config: {
          presence: { key: isStaff ? 'staff' : 'patient' },
        },
      });

      // Helper to send the current offer
      const sendOffer = () => {
        if (currentOfferRef.current && channelRef.current) {
          console.log('[WebRTC] Sending offer to patient');
          channelRef.current.send({
            type: 'broadcast',
            event: 'offer',
            payload: { offer: currentOfferRef.current, from: 'staff' },
          });
        }
      };

      channel
        // Presence: detect when other party joins
        .on('presence', { event: 'sync' }, () => {
          const state = channel.presenceState();
          console.log('[WebRTC] Presence sync:', state);
          // Check if the other party is already present
          const hasStaff = Object.keys(state).some(key => key === 'staff' || state[key]?.some?.((p: any) => p.role === 'staff'));
          const hasPatient = Object.keys(state).some(key => key === 'patient' || state[key]?.some?.((p: any) => p.role === 'patient'));
          console.log('[WebRTC] Presence state - Staff:', hasStaff, 'Patient:', hasPatient);
        })
        .on('presence', { event: 'join' }, ({ newPresences }) => {
          console.log('[WebRTC] Presence join:', newPresences);
          // Staff re-sends offer when patient joins
          if (isStaff && currentOfferRef.current) {
            console.log('[WebRTC] Patient joined, sending offer');
            sendOffer();
          }
        })
        .on('presence', { event: 'leave' }, ({ leftPresences }) => {
          console.log('[WebRTC] Presence leave:', leftPresences);
        })
        // Handle ready signals from both parties
        .on('broadcast', { event: 'staff-ready' }, () => {
          if (!isStaff) {
            console.log('[WebRTC] Staff is ready, requesting offer');
            channel.send({
              type: 'broadcast',
              event: 'request-offer',
              payload: { from: 'patient' },
            });
          }
        })
        .on('broadcast', { event: 'patient-ready' }, () => {
          if (isStaff && currentOfferRef.current) {
            console.log('[WebRTC] Patient is ready, sending offer');
            sendOffer();
          }
        })
        // Patient can request offer if they missed it
        .on('broadcast', { event: 'request-offer' }, ({ payload }) => {
          if (isStaff && payload.from === 'patient') {
            console.log('[WebRTC] Patient requested offer');
            sendOffer();
          }
        })
        .on('broadcast', { event: 'offer' }, async ({ payload }) => {
          if (!isStaff && payload.from === 'staff') {
            console.log('[WebRTC] Received offer from staff', payload.iceRestart ? '(ICE restart)' : '');
            try {
              await pc.setRemoteDescription(new RTCSessionDescription(payload.offer));
              
              // Send acknowledgement
              channel.send({
                type: 'broadcast',
                event: 'offer-received',
                payload: { from: 'patient' },
              });
              
              // Process any pending ICE candidates
              for (const candidate of pendingCandidatesRef.current) {
                await pc.addIceCandidate(new RTCIceCandidate(candidate));
              }
              pendingCandidatesRef.current = [];
              
              const answer = await pc.createAnswer();
              await pc.setLocalDescription(answer);
              
              console.log('[WebRTC] Sending answer to staff');
              channel.send({
                type: 'broadcast',
                event: 'answer',
                payload: { answer, from: 'patient' },
              });
            } catch (err) {
              console.error('[WebRTC] Error handling offer:', err);
              onError?.('Failed to process call offer');
            }
          }
        })
        // Staff acknowledges offer was received (for debugging/logging)
        .on('broadcast', { event: 'offer-received' }, ({ payload }) => {
          if (isStaff && payload.from === 'patient') {
            console.log('[WebRTC] Patient confirmed offer received');
          }
        })
        .on('broadcast', { event: 'answer' }, async ({ payload }) => {
          if (isStaff && payload.from === 'patient') {
            console.log('[WebRTC] Received answer from patient');
            try {
              await pc.setRemoteDescription(new RTCSessionDescription(payload.answer));
              
              // Send acknowledgement
              channel.send({
                type: 'broadcast',
                event: 'answer-received',
                payload: { from: 'staff' },
              });
              
              // Reset retry count on success
              answerRetryCountRef.current = 0;
              
              // Process any pending ICE candidates
              for (const candidate of pendingCandidatesRef.current) {
                await pc.addIceCandidate(new RTCIceCandidate(candidate));
              }
              pendingCandidatesRef.current = [];
            } catch (err) {
              console.error('[WebRTC] Error handling answer, attempt', answerRetryCountRef.current + 1);
              
              // Retry logic: request new answer
              if (answerRetryCountRef.current < MAX_ANSWER_RETRIES) {
                answerRetryCountRef.current++;
                const delay = ANSWER_RETRY_DELAY * answerRetryCountRef.current;
                
                console.log(`[WebRTC] Requesting new answer in ${delay}ms...`);
                setTimeout(() => {
                  channel.send({
                    type: 'broadcast',
                    event: 'request-answer',
                    payload: { from: 'staff' },
                  });
                }, delay);
              } else {
                console.error('[WebRTC] Max answer retries exceeded');
                onError?.('Failed to establish connection after multiple attempts');
              }
            }
          }
        })
        // Patient confirms answer was received
        .on('broadcast', { event: 'answer-received' }, ({ payload }) => {
          if (!isStaff && payload.from === 'staff') {
            console.log('[WebRTC] Staff confirmed answer received');
          }
        })
        // Staff can request patient to resend answer
        .on('broadcast', { event: 'request-answer' }, async ({ payload }) => {
          if (!isStaff && payload.from === 'staff' && pc.localDescription) {
            console.log('[WebRTC] Staff requested new answer, resending...');
            channel.send({
              type: 'broadcast',
              event: 'answer',
              payload: { answer: pc.localDescription, from: 'patient' },
            });
          }
        })
        .on('broadcast', { event: 'ice-candidate' }, async ({ payload }) => {
          const expectedFrom = isStaff ? 'patient' : 'staff';
          if (payload.from === expectedFrom && payload.candidate) {
            console.log('[WebRTC] Received ICE candidate from', payload.from);
            try {
              if (pc.remoteDescription) {
                await pc.addIceCandidate(new RTCIceCandidate(payload.candidate));
              } else {
                pendingCandidatesRef.current.push(payload.candidate);
              }
            } catch (err) {
              console.error('[WebRTC] Error adding ICE candidate:', err);
            }
          }
        })
        .on('broadcast', { event: 'end-call' }, () => {
          console.log('[WebRTC] Received end-call signal');
          cleanup();
          onCallEnded?.();
        })
        .subscribe(async (status) => {
          console.log('[WebRTC] Channel subscription status:', status);
          
          if (isResolved) return; // Prevent double resolution
          
          if (status === 'SUBSCRIBED') {
            const role = isStaff ? 'staff' : 'patient';
            console.log('[WebRTC] Tracking presence as:', role);
            try {
              await channel.track({ role, online_at: Date.now() });
              channelRef.current = channel;
              
              // Broadcast ready signal so both parties know when to exchange
              const readyEvent = isStaff ? 'staff-ready' : 'patient-ready';
              console.log('[WebRTC] Broadcasting ready signal:', readyEvent);
              channel.send({
                type: 'broadcast',
                event: readyEvent,
                payload: { from: role },
              });
              
              isResolved = true;
              if (timeoutId) clearTimeout(timeoutId);
              resolve();
            } catch (err) {
              console.error('[WebRTC] Failed to track presence:', err);
              isResolved = true;
              if (timeoutId) clearTimeout(timeoutId);
              reject(new Error('Failed to join room: presence tracking failed'));
            }
          } else if (status === 'TIMED_OUT') {
            console.error('[WebRTC] Channel subscription timed out');
            isResolved = true;
            if (timeoutId) clearTimeout(timeoutId);
            supabase.removeChannel(channel);
            reject(new Error('Connection timed out. Please check your internet connection and try again.'));
          } else if (status === 'CHANNEL_ERROR') {
            console.error('[WebRTC] Channel error occurred');
            isResolved = true;
            if (timeoutId) clearTimeout(timeoutId);
            supabase.removeChannel(channel);
            reject(new Error('Connection error. The signaling service may be temporarily unavailable.'));
          } else if (status === 'CLOSED') {
            console.error('[WebRTC] Channel was closed');
            isResolved = true;
            if (timeoutId) clearTimeout(timeoutId);
            reject(new Error('Connection closed unexpectedly. Please try again.'));
          }
        });

      // Timeout for subscription - only reject if not already resolved
      timeoutId = setTimeout(() => {
        if (!isResolved) {
          console.error('[WebRTC] Channel subscription timeout after 20s');
          isResolved = true;
          supabase.removeChannel(channel);
          reject(new Error('Connection timeout. Please check your network and try again.'));
        }
      }, 20000);
    });
  };

  // Wrapper with retry logic for setupSignaling
  const setupSignalingWithRetry = async (pc: RTCPeerConnection): Promise<void> => {
    let attempts = 0;
    let lastError: Error | null = null;
    
    // First check if backend is reachable
    const isReachable = await checkBackendConnectivity();
    if (!isReachable) {
      throw new Error('Cannot reach server. Please check your internet connection.');
    }
    
    while (attempts < MAX_RETRY_ATTEMPTS) {
      try {
        setRetryAttempt(attempts);
        await setupSignaling(pc);
        setRetryAttempt(0); // Reset on success
        return; // Success
      } catch (err) {
        lastError = err as Error;
        attempts++;
        
        console.log(`[WebRTC] Signaling attempt ${attempts} failed:`, lastError.message);
        
        if (attempts < MAX_RETRY_ATTEMPTS) {
          const delay = INITIAL_RETRY_DELAY * Math.pow(2, attempts - 1);
          console.log(`[WebRTC] Retrying in ${delay}ms... (attempt ${attempts + 1}/${MAX_RETRY_ATTEMPTS})`);
          setConnectionStatus('retrying');
          setRetryAttempt(attempts);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    
    setRetryAttempt(0);
    throw lastError || new Error('Failed to connect after multiple attempts');
  };

  const startCall = async () => {
    console.log('[WebRTC] Starting call as', isStaff ? 'staff' : 'patient');
    setConnectionStatus('initializing-media');
    setConnectionError(null);
    setRetryAttempt(0);
    setIsConnecting(true);
    
    try {
      const stream = await initializeMedia();
      
      setConnectionStatus('connecting-to-room');
      const pc = createPeerConnection(stream);
      
      // STAFF: Create offer BEFORE setting up signaling
      // This ensures currentOfferRef is set when presence events fire
      if (isStaff) {
        console.log('[WebRTC] Creating offer with explicit receive capabilities...');
        // CRITICAL FIX: Include offerToReceiveAudio/Video options
        // This guarantees the SDP will include m= lines for receiving media
        const offer = await pc.createOffer({
          offerToReceiveAudio: true,
          offerToReceiveVideo: true,
        });
        await pc.setLocalDescription(offer);
        currentOfferRef.current = offer;
        console.log('[WebRTC] Offer created with sendrecv transceivers');
      }
      
      // Now set up signaling with retry logic
      await setupSignalingWithRetry(pc);
      console.log('[WebRTC] Signaling channel ready');
      
      setConnectionStatus('waiting-for-peer');

      if (isStaff) {
        // Send offer immediately (patient may already be waiting)
        console.log('[WebRTC] Sending initial offer');
        channelRef.current?.send({
          type: 'broadcast',
          event: 'offer',
          payload: { offer: currentOfferRef.current, from: 'staff' },
        });
      } else {
        // Patient: Poll for offer with exponential backoff
        let pollCount = 0;
        const maxPolls = 5;
        
        // Clear any existing poll interval
        if (offerPollIntervalRef.current) {
          clearInterval(offerPollIntervalRef.current);
        }
        
        const pollForOffer = () => {
          // Stop polling if we have a remote description (offer received)
          if (peerConnectionRef.current?.remoteDescription) {
            console.log('[WebRTC] Offer received, stopping poll');
            return;
          }
          
          pollCount++;
          if (pollCount > maxPolls) {
            console.log('[WebRTC] Max poll attempts reached, stopping');
            return;
          }
          
          console.log(`[WebRTC] Polling for offer, attempt ${pollCount}/${maxPolls}`);
          channelRef.current?.send({
            type: 'broadcast',
            event: 'request-offer',
            payload: { from: 'patient' },
          });
          
          // Exponential backoff: 1s, 2s, 4s, 8s, 16s (with jitter)
          const delay = Math.min(1000 * Math.pow(2, pollCount - 1), 16000);
          const jitter = Math.random() * 500;
          setTimeout(pollForOffer, delay + jitter);
        };
        
        console.log('[WebRTC] Starting offer polling with exponential backoff');
        // Start first poll after 1 second
        setTimeout(pollForOffer, 1000);
      }
      
      // Set connection timeout
      connectionTimeoutRef.current = setTimeout(() => {
        if (peerConnectionRef.current?.connectionState === 'connecting' || 
            peerConnectionRef.current?.connectionState === 'new') {
          console.log('[WebRTC] Connection timeout after', CONNECTION_TIMEOUT_MS / 1000, 'seconds');
          setConnectionError('Connection timed out. Please try again.');
          setConnectionStatus('failed');
          onError?.('Connection timed out. Please try again.');
        }
      }, CONNECTION_TIMEOUT_MS);
    } catch (err) {
      console.error('[WebRTC] Failed to start call:', err);
      setConnectionStatus('failed');
      setConnectionError(err instanceof Error ? err.message : 'Failed to start video call');
      cleanup(); // Clean up on failure so user can retry
      setIsConnecting(false);
      onError?.(err instanceof Error ? err.message : 'Failed to start video call');
    }
  };

  const retryCall = useCallback(async () => {
    console.log('[WebRTC] Retrying call...');
    cleanup();
    setConnectionError(null);
    setConnectionStatus('idle');
    await startCall();
  }, [cleanup]);

  const endCall = () => {
    console.log('[WebRTC] Ending call');
    channelRef.current?.send({
      type: 'broadcast',
      event: 'end-call',
      payload: {},
    });
    cleanup();
    onCallEnded?.();
  };

  const toggleAudio = () => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsAudioEnabled(audioTrack.enabled);
        console.log('[WebRTC] Audio toggled:', audioTrack.enabled);
      }
    }
  };

  const toggleVideo = () => {
    if (localStreamRef.current) {
      const videoTrack = localStreamRef.current.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setIsVideoEnabled(videoTrack.enabled);
        console.log('[WebRTC] Video toggled:', videoTrack.enabled);
      }
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanup();
    };
  }, []);

  return {
    localStream,
    remoteStream,
    isConnecting,
    isConnected,
    connectionState,
    connectionStatus,
    connectionError,
    retryAttempt,
    startCall,
    endCall,
    retryCall,
    toggleAudio,
    toggleVideo,
    isAudioEnabled,
    isVideoEnabled,
  };
}
