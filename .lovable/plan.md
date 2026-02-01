

# Plan: Fix Doctor Not Seeing Patient's Video

## Root Cause Analysis

After deep investigation, I found **three critical issues** causing the doctor to not see the patient's video:

### Issue 1: Track Transceiver Direction Mismatch

**Problem**: When staff creates an offer BEFORE receiving any tracks from the patient, the SDP (Session Description Protocol) doesn't include the proper transceivers for receiving media. The staff's peer connection is set up only to SEND video, not to RECEIVE it.

**Evidence in code**: In `useWebRTC.ts` lines 521-527, staff creates the offer immediately after adding their local tracks but before any negotiation about receiving tracks:
```typescript
if (isStaff) {
  const offer = await pc.createOffer();  // Only sends tracks, no recv
  await pc.setLocalDescription(offer);
  currentOfferRef.current = offer;
}
```

### Issue 2: Remote Stream Reference Created Too Early

**Problem**: In `createPeerConnection()` (line 169-172), a new empty `MediaStream` is created and set as remoteStream BEFORE any tracks arrive. When tracks do arrive (line 187-189), a new `MediaStream` is created but the React component may not re-render properly because the stream object reference keeps changing.

### Issue 3: Missing `addTransceiver` for Bidirectional Media

**Problem**: The peer connection doesn't explicitly declare it wants to receive video. Without explicit transceivers, the SDP negotiation may not properly set up bidirectional video.

---

## Solution

### Fix 1: Add Explicit Transceivers for Receiving Media

Before creating the offer, the staff must add transceivers that indicate "I want to receive video and audio":

```typescript
// Add transceivers for receiving media BEFORE creating offer
pc.addTransceiver('video', { direction: 'sendrecv' });
pc.addTransceiver('audio', { direction: 'sendrecv' });
```

### Fix 2: Stabilize Remote Stream Reference

Instead of creating new `MediaStream` objects, maintain a single stable reference and only update React state when tracks actually change:

```typescript
// Track remote tracks by ID to detect actual changes
const remoteTrackIds = new Set<string>();

pc.ontrack = (event) => {
  const track = event.track;
  if (!remoteTrackIds.has(track.id)) {
    remoteTrackIds.add(track.id);
    remoteStreamRef.current.addTrack(track);
    // Trigger React update
    setRemoteStream(new MediaStream(remoteStreamRef.current.getTracks()));
  }
};
```

### Fix 3: Handle Stream from Event Properly

The `ontrack` event provides `event.streams[0]` which is the actual remote stream. We should use this when available:

```typescript
pc.ontrack = (event) => {
  if (event.streams && event.streams[0]) {
    // Use the stream provided by WebRTC
    remoteStreamRef.current = event.streams[0];
    setRemoteStream(event.streams[0]);
  } else {
    // Fallback: manually add track
    remoteStreamRef.current.addTrack(event.track);
  }
};
```

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/hooks/useWebRTC.ts` | Add transceivers, fix remote stream handling, use event.streams |

---

## Implementation Details

### Modified `createPeerConnection` function

```typescript
const createPeerConnection = (stream: MediaStream) => {
  const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

  // CRITICAL: Add transceivers for bidirectional media
  // This ensures the SDP includes "recvonly" or "sendrecv" for incoming tracks
  pc.addTransceiver('audio', { direction: 'sendrecv' });
  pc.addTransceiver('video', { direction: 'sendrecv' });

  // Add local tracks
  stream.getTracks().forEach(track => {
    pc.addTrack(track, stream);
  });

  // Initialize remote stream ref if needed
  if (!remoteStreamRef.current) {
    remoteStreamRef.current = new MediaStream();
  }

  // Handle remote tracks - PROPERLY this time
  pc.ontrack = (event) => {
    console.log('[WebRTC] ontrack:', event.track.kind, event.streams);
    
    // Prefer using the stream from the event (if available)
    if (event.streams && event.streams[0]) {
      console.log('[WebRTC] Using stream from event');
      remoteStreamRef.current = event.streams[0];
      setRemoteStream(event.streams[0]);
    } else {
      // Fallback: add track to our managed stream
      const existingTrack = remoteStreamRef.current?.getTracks()
        .find(t => t.id === event.track.id);
      
      if (!existingTrack) {
        console.log('[WebRTC] Adding track to managed stream:', event.track.kind);
        remoteStreamRef.current.addTrack(event.track);
        
        // Create new reference to trigger React re-render
        const updatedStream = new MediaStream(remoteStreamRef.current.getTracks());
        remoteStreamRef.current = updatedStream;
        setRemoteStream(updatedStream);
      }
    }

    // Track lifecycle events
    event.track.onended = () => console.log('[WebRTC] Track ended:', event.track.kind);
    event.track.onmute = () => console.log('[WebRTC] Track muted:', event.track.kind);
    event.track.onunmute = () => console.log('[WebRTC] Track unmuted:', event.track.kind);
  };

  // ... rest remains same
};
```

### Modified `startCall` function (Staff side)

```typescript
if (isStaff) {
  console.log('[WebRTC] Creating offer with sendrecv transceivers...');
  
  // Create offer with explicit options to receive media
  const offer = await pc.createOffer({
    offerToReceiveAudio: true,
    offerToReceiveVideo: true,
  });
  
  await pc.setLocalDescription(offer);
  currentOfferRef.current = offer;
  console.log('[WebRTC] Offer created with receive capabilities');
}
```

---

## Why Previous Fixes Didn't Work

1. **Polling for offer** - The signaling worked, but the SDP itself didn't have proper receive capabilities
2. **Track state checks** - The tracks weren't arriving at all because the SDP didn't negotiate receiving
3. **Stream reference changes** - Didn't matter because no tracks were being received

The core issue was always that **the staff's SDP offer didn't include transceivers for receiving media**.

---

## Technical Background

WebRTC requires explicit negotiation of media directions:
- `sendonly` - I will send but not receive
- `recvonly` - I will receive but not send  
- `sendrecv` - I will both send and receive
- `inactive` - No media

When you call `pc.addTrack()` without transceivers, WebRTC defaults to `sendrecv` for that track. BUT if the offer is created before the remote party adds their tracks, the negotiation may not properly include receiving capabilities.

By explicitly adding transceivers with `direction: 'sendrecv'` AND using `offerToReceiveVideo: true` in the offer options, we guarantee the SDP will include the proper `m=` lines for receiving both audio and video.

---

## Summary

This fix addresses the root cause by:

1. **Adding explicit transceivers** before creating the offer
2. **Using `offerToReceiveVideo: true`** option when creating the offer
3. **Properly handling `event.streams[0]`** in the ontrack handler
4. **Stabilizing stream references** to prevent React rendering issues

This should finally resolve the issue where the doctor cannot see the patient's video.

