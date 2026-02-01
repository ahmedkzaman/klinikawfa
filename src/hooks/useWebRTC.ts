import { useState, useRef, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { RealtimeChannel } from '@supabase/supabase-js';

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
  startCall: () => Promise<void>;
  endCall: () => void;
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
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);

  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const pendingCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  const currentOfferRef = useRef<RTCSessionDescriptionInit | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);

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
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });
      localStreamRef.current = stream;
      setLocalStream(stream);
      console.log('[WebRTC] Media initialized successfully');
      return stream;
    } catch (err) {
      console.error('[WebRTC] Failed to get media devices:', err);
      onError?.('Failed to access camera/microphone. Please check permissions.');
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

    // Handle remote tracks
    pc.ontrack = (event) => {
      console.log('[WebRTC] Received remote track:', event.track.kind);
      const [remoteStream] = event.streams;
      setRemoteStream(remoteStream);
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
        setIsConnected(true);
        setIsConnecting(false);
        onCallStarted?.();
      } else if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
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

  const setupSignaling = (pc: RTCPeerConnection): Promise<void> => {
    return new Promise((resolve, reject) => {
      console.log('[WebRTC] Setting up signaling channel for room:', roomCode);
      const channel = supabase.channel(`video-room-${roomCode}`);

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
          if (status === 'SUBSCRIBED') {
            // Track presence
            const role = isStaff ? 'staff' : 'patient';
            console.log('[WebRTC] Tracking presence as:', role);
            await channel.track({ role, online_at: Date.now() });
            channelRef.current = channel;
            resolve();
          } else if (status === 'CHANNEL_ERROR') {
            console.error('[WebRTC] Channel error');
            reject(new Error('Failed to join signaling channel'));
          }
        });

      // Timeout for subscription
      setTimeout(() => {
        if (!channelRef.current) {
          console.error('[WebRTC] Channel subscription timeout');
          reject(new Error('Channel subscription timeout'));
        }
      }, 15000);
    });
  };

  const startCall = async () => {
    console.log('[WebRTC] Starting call as', isStaff ? 'staff' : 'patient');
    setIsConnecting(true);
    
    try {
      const stream = await initializeMedia();
      const pc = createPeerConnection(stream);
      
      // Wait for channel to be ready
      await setupSignaling(pc);
      console.log('[WebRTC] Signaling channel ready');

      if (isStaff) {
        // Staff creates and stores the offer
        console.log('[WebRTC] Creating offer...');
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        currentOfferRef.current = offer;
        
        // Send offer immediately (patient may already be waiting)
        console.log('[WebRTC] Sending initial offer');
        channelRef.current?.send({
          type: 'broadcast',
          event: 'offer',
          payload: { offer, from: 'staff' },
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
      setIsConnecting(false);
      onError?.('Failed to start video call');
    }
  };

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
    startCall,
    endCall,
    toggleAudio,
    toggleVideo,
    isAudioEnabled,
    isVideoEnabled,
  };
}
