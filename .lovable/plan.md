
# Plan: Fix One-Way Video (Doctor Can't See Patient)

## Problem Identified

The doctor sees a placeholder where the patient's video should be, but the patient can see both feeds. This is a **one-way media flow problem** caused by incorrect transceiver setup on the patient side.

## Root Cause Analysis

In WebRTC, the **answerer (patient)** should NOT create their own transceivers before receiving the offer. The current code does this:

```text
Patient Flow (Current - WRONG):
1. createPeerConnection(stream)
   -> addTransceiver('audio', sendrecv)  // Creates transceiver 0
   -> addTransceiver('video', sendrecv)  // Creates transceiver 1
   -> addTrack(audio) -> goes to transceiver 0
   -> addTrack(video) -> goes to transceiver 1
2. Receive offer from staff
   -> setRemoteDescription(offer)
   -> Offer has its OWN transceivers from staff
   -> MISMATCH: Patient's pre-created transceivers don't align
3. Create answer
   -> Answer uses patient's transceivers, not staff's
4. Result: Staff's transceiver for receiving patient video never gets the track
```

The correct flow for the answerer is:

```text
Patient Flow (Correct):
1. createPeerConnection(stream) - but DON'T add transceivers
2. Receive offer -> setRemoteDescription(offer)
   -> This creates transceivers FROM the offer
3. Add local tracks
   -> addTrack() associates tracks with existing transceivers
4. Create answer
   -> Answer correctly references staff's transceivers
```

## Solution

Modify `createPeerConnection()` to only add transceivers for the **offerer (staff)**, not the answerer (patient).

### Changes to `src/hooks/useWebRTC.ts`

**Before:**
```typescript
const createPeerConnection = (stream: MediaStream) => {
  const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
  
  // ALWAYS adds transceivers - WRONG for answerer!
  pc.addTransceiver('audio', { direction: 'sendrecv' });
  pc.addTransceiver('video', { direction: 'sendrecv' });
  
  stream.getTracks().forEach(track => {
    pc.addTrack(track, stream);
  });
  // ...
};
```

**After:**
```typescript
const createPeerConnection = (stream: MediaStream) => {
  const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
  
  // ONLY add transceivers for the OFFERER (staff)
  // The answerer (patient) should NOT add transceivers - they come from the offer
  if (isStaff) {
    console.log('[WebRTC] Staff: Adding transceivers for bidirectional media...');
    pc.addTransceiver('audio', { direction: 'sendrecv' });
    pc.addTransceiver('video', { direction: 'sendrecv' });
  }
  
  // Add local tracks
  stream.getTracks().forEach(track => {
    console.log('[WebRTC] Adding local track:', track.kind);
    pc.addTrack(track, stream);
  });
  // ...
};
```

This single change ensures:
- Staff (offerer) creates transceivers that negotiate for bidirectional media
- Patient (answerer) lets the offer's transceivers define the media flow
- Patient's `addTrack()` associates with the correct transceiver from the offer
- Staff receives the patient's video track properly

## Technical Details

The WebRTC `addTrack()` method will automatically:
1. Look for an existing transceiver that can send the track type
2. Associate the track with that transceiver
3. Update the transceiver's direction as needed

For the patient, after `setRemoteDescription(offer)`:
- Transceivers from the offer are created with `recvonly` direction
- `addTrack()` changes them to `sendrecv`
- The answer includes the patient's track in the correct transceiver

## Files to Modify

| File | Change |
|------|--------|
| `src/hooks/useWebRTC.ts` | Conditionally add transceivers only for staff (offerer) |

## Summary

The fix is a 4-line conditional check that prevents the patient from creating duplicate transceivers. This ensures proper transceiver alignment between offer and answer, allowing bidirectional video to flow correctly.
