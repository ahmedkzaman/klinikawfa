
# Plan: Fix Patient Connection Error (Duplicate Transceiver Issue)

## Problem

After the previous fix to enable bidirectional media, the patient now sees an error when trying to connect. The doctor can see the patient's video, suggesting the issue is on the patient side during SDP negotiation.

## Root Cause Analysis

The current code creates **duplicate transceivers**, causing SDP mismatch:

```typescript
// Lines 166-167: Creates 2 transceivers explicitly
pc.addTransceiver('audio', { direction: 'sendrecv' });
pc.addTransceiver('video', { direction: 'sendrecv' });

// Lines 170-172: Creates 2 MORE transceivers when adding tracks
stream.getTracks().forEach(track => {
  pc.addTrack(track, stream);  // Each addTrack creates a new transceiver!
});
```

**Result**: Staff's SDP offer has 4 media lines (m=audio, m=video, m=audio, m=video), but this can cause issues when the patient tries to `setRemoteDescription` because:
1. Browser may reject malformed SDP
2. Track-to-transceiver mapping becomes ambiguous
3. Answer creation fails with mismatched transceiver count

## Solution

**Use `offerToReceiveAudio/Video` options instead of explicit transceivers**

The `pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true })` approach is sufficient for the staff side. We should:

1. **Remove** the explicit `addTransceiver()` calls
2. **Keep** the `offerToReceiveAudio/Video` options in createOffer (staff only)
3. **Let** `addTrack()` naturally create transceivers with `sendrecv` direction

This ensures exactly 2 transceivers are created (one for audio, one for video).

---

## Implementation Details

### File: `src/hooks/useWebRTC.ts`

**Change 1**: Remove duplicate transceiver creation in `createPeerConnection`

```typescript
// BEFORE (problematic):
pc.addTransceiver('audio', { direction: 'sendrecv' });
pc.addTransceiver('video', { direction: 'sendrecv' });
stream.getTracks().forEach(track => {
  pc.addTrack(track, stream);
});

// AFTER (correct):
// Just add tracks - they create transceivers automatically
stream.getTracks().forEach(track => {
  pc.addTrack(track, stream);
});
```

**Change 2**: Staff creates offer with receive options (already in place)

This is the correct approach for the staff side - keeps the `offerToReceiveAudio/Video` options which ensure the SDP includes proper direction for receiving media.

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/hooks/useWebRTC.ts` | Remove explicit `addTransceiver()` calls, keep `offerToReceiveAudio/Video` in createOffer |

---

## Technical Details

### How WebRTC Transceivers Work

When you call `pc.addTrack(track, stream)`:
- WebRTC automatically creates a transceiver for that track
- The direction defaults to `sendrecv` (can both send and receive)
- This is the standard approach

When you call `pc.addTransceiver('video', { direction: 'sendrecv' })`:
- Creates an empty transceiver that can receive video
- Useful when you want to receive but not send

**The problem**: Doing BOTH creates duplicate transceivers!

### Why Staff Needs `offerToReceiveAudio/Video`

Even though `addTrack()` creates `sendrecv` transceivers, the offer options ensure:
- The SDP explicitly includes `a=recvonly` or `a=sendrecv` lines
- Some browsers need this explicit hint to properly negotiate
- It's a safety net, not a replacement for transceivers

---

## Summary

The fix is simple: **Remove the explicit `addTransceiver()` calls** that were added in the previous fix. The `addTrack()` method already creates proper bidirectional transceivers, and the `offerToReceiveAudio/Video` options in `createOffer` ensure the staff can receive media.

This should resolve the patient connection error while maintaining the doctor's ability to see the patient's video.
