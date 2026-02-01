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

  const cleanup = useCallback(() => {
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
    if (localStream) {
      localStream.getTracks().forEach(track => track.stop());
      setLocalStream(null);
    }
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
    setRemoteStream(null);
    setIsConnecting(false);
    setIsConnected(false);
    setConnectionState('closed');
  }, [localStream]);

  const initializeMedia = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });
      setLocalStream(stream);
      return stream;
    } catch (err) {
      console.error('Failed to get media devices:', err);
      onError?.('Failed to access camera/microphone. Please check permissions.');
      throw err;
    }
  };

  const createPeerConnection = (stream: MediaStream) => {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    // Add local tracks
    stream.getTracks().forEach(track => {
      pc.addTrack(track, stream);
    });

    // Handle remote tracks
    pc.ontrack = (event) => {
      console.log('Received remote track:', event.track.kind);
      const [remoteStream] = event.streams;
      setRemoteStream(remoteStream);
    };

    // Handle ICE candidates
    pc.onicecandidate = async (event) => {
      if (event.candidate) {
        console.log('New ICE candidate:', event.candidate.type);
        // Broadcast ICE candidate via Supabase Realtime
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
      console.log('Connection state:', pc.connectionState);
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
      console.log('ICE connection state:', pc.iceConnectionState);
    };

    peerConnectionRef.current = pc;
    return pc;
  };

  const setupSignaling = (pc: RTCPeerConnection) => {
    const channel = supabase.channel(`video-room-${roomCode}`);

    channel
      .on('broadcast', { event: 'offer' }, async ({ payload }) => {
        if (!isStaff && payload.from === 'staff') {
          console.log('Received offer from staff');
          try {
            await pc.setRemoteDescription(new RTCSessionDescription(payload.offer));
            
            // Process any pending ICE candidates
            for (const candidate of pendingCandidatesRef.current) {
              await pc.addIceCandidate(new RTCIceCandidate(candidate));
            }
            pendingCandidatesRef.current = [];
            
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            
            channel.send({
              type: 'broadcast',
              event: 'answer',
              payload: { answer, from: 'patient' },
            });
          } catch (err) {
            console.error('Error handling offer:', err);
            onError?.('Failed to process call offer');
          }
        }
      })
      .on('broadcast', { event: 'answer' }, async ({ payload }) => {
        if (isStaff && payload.from === 'patient') {
          console.log('Received answer from patient');
          try {
            await pc.setRemoteDescription(new RTCSessionDescription(payload.answer));
            
            // Process any pending ICE candidates
            for (const candidate of pendingCandidatesRef.current) {
              await pc.addIceCandidate(new RTCIceCandidate(candidate));
            }
            pendingCandidatesRef.current = [];
          } catch (err) {
            console.error('Error handling answer:', err);
            onError?.('Failed to establish connection');
          }
        }
      })
      .on('broadcast', { event: 'ice-candidate' }, async ({ payload }) => {
        const expectedFrom = isStaff ? 'patient' : 'staff';
        if (payload.from === expectedFrom && payload.candidate) {
          console.log('Received ICE candidate from', payload.from);
          try {
            if (pc.remoteDescription) {
              await pc.addIceCandidate(new RTCIceCandidate(payload.candidate));
            } else {
              // Queue the candidate until we have a remote description
              pendingCandidatesRef.current.push(payload.candidate);
            }
          } catch (err) {
            console.error('Error adding ICE candidate:', err);
          }
        }
      })
      .on('broadcast', { event: 'end-call' }, () => {
        console.log('Received end-call signal');
        cleanup();
        onCallEnded?.();
      })
      .subscribe();

    channelRef.current = channel;
  };

  const startCall = async () => {
    setIsConnecting(true);
    
    try {
      const stream = await initializeMedia();
      const pc = createPeerConnection(stream);
      setupSignaling(pc);

      // Staff initiates the call with an offer
      if (isStaff) {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        
        // Wait for signaling to be ready
        setTimeout(() => {
          channelRef.current?.send({
            type: 'broadcast',
            event: 'offer',
            payload: { offer, from: 'staff' },
          });
        }, 1000);
      }
    } catch (err) {
      console.error('Failed to start call:', err);
      setIsConnecting(false);
      onError?.('Failed to start video call');
    }
  };

  const endCall = () => {
    channelRef.current?.send({
      type: 'broadcast',
      event: 'end-call',
      payload: {},
    });
    cleanup();
    onCallEnded?.();
  };

  const toggleAudio = () => {
    if (localStream) {
      const audioTrack = localStream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsAudioEnabled(audioTrack.enabled);
      }
    }
  };

  const toggleVideo = () => {
    if (localStream) {
      const videoTrack = localStream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setIsVideoEnabled(videoTrack.enabled);
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
