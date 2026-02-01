import { useState, useRef, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { RealtimeChannel } from '@supabase/supabase-js';
import type { ConnectionStatus } from '@/components/video/ConnectionStatusIndicator';

// Retry configuration for signaling channel
const MAX_RETRY_ATTEMPTS = 3;
const INITIAL_RETRY_DELAY = 2000; // 2 seconds

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

  const cleanup = useCallback(() => {
    console.log('[WebRTC] Cleaning up...');
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

    // Add local tracks
    stream.getTracks().forEach(track => {
      console.log('[WebRTC] Adding local track:', track.kind);
      pc.addTrack(track, stream);
    });

    // Create a persistent remote stream to collect all remote tracks
    if (!remoteStreamRef.current) {
      remoteStreamRef.current = new MediaStream();
      setRemoteStream(remoteStreamRef.current);
    }

    // Handle remote tracks - add each track to our persistent stream
    pc.ontrack = (event) => {
      console.log('[WebRTC] Received remote track:', event.track.kind, 'readyState:', event.track.readyState);
      
      const track = event.track;
      
      // Add track to our persistent remote stream if not already there
      const existingTrack = remoteStreamRef.current?.getTracks().find(t => t.id === track.id);
      if (!existingTrack && remoteStreamRef.current) {
        console.log('[WebRTC] Adding track to remote stream:', track.kind);
        remoteStreamRef.current.addTrack(track);
        
        // Force React to re-render by creating a new stream reference
        const newStream = new MediaStream(remoteStreamRef.current.getTracks());
        remoteStreamRef.current = newStream;
        setRemoteStream(newStream);
      }
      
      // Listen for track ending
      track.onended = () => {
        console.log('[WebRTC] Remote track ended:', track.kind);
      };
      
      track.onmute = () => {
        console.log('[WebRTC] Remote track muted:', track.kind);
      };
      
      track.onunmute = () => {
        console.log('[WebRTC] Remote track unmuted:', track.kind);
      };
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
        setConnectionStatus('connected');
        setIsConnected(true);
        setIsConnecting(false);
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

    pc.oniceconnectionstatechange = () => {
      console.log('[WebRTC] ICE connection state:', pc.iceConnectionState);
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
        // Patient can request offer if they missed it
        .on('broadcast', { event: 'request-offer' }, ({ payload }) => {
          if (isStaff && payload.from === 'patient') {
            console.log('[WebRTC] Patient requested offer');
            sendOffer();
          }
        })
        .on('broadcast', { event: 'offer' }, async ({ payload }) => {
          if (!isStaff && payload.from === 'staff') {
            console.log('[WebRTC] Received offer from staff');
            try {
              await pc.setRemoteDescription(new RTCSessionDescription(payload.offer));
              
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
        .on('broadcast', { event: 'answer' }, async ({ payload }) => {
          if (isStaff && payload.from === 'patient') {
            console.log('[WebRTC] Received answer from patient');
            try {
              await pc.setRemoteDescription(new RTCSessionDescription(payload.answer));
              
              // Process any pending ICE candidates
              for (const candidate of pendingCandidatesRef.current) {
                await pc.addIceCandidate(new RTCIceCandidate(candidate));
              }
              pendingCandidatesRef.current = [];
            } catch (err) {
              console.error('[WebRTC] Error handling answer:', err);
              onError?.('Failed to establish connection');
            }
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
        console.log('[WebRTC] Creating offer before signaling...');
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        currentOfferRef.current = offer;
        console.log('[WebRTC] Offer created and stored');
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
        // Patient: request offer after a delay if not received
        setTimeout(() => {
          if (peerConnectionRef.current && !peerConnectionRef.current.remoteDescription) {
            console.log('[WebRTC] No offer received, requesting from staff...');
            channelRef.current?.send({
              type: 'broadcast',
              event: 'request-offer',
              payload: { from: 'patient' },
            });
          }
        }, 3000);
      }
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
