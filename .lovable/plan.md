
# Plan: Fix Video Call Connection and Remote Video Display

## Problem Summary

Two issues reported:
1. **Connection fails to establish** - Signaling channel timing/synchronization problems
2. **Patient's video not visible** - Remote video tracks not properly displayed

## Root Cause Analysis

### Issue 1: Connection Failure

After analyzing the code, I found several problems:

1. **Race Condition in Offer/Answer Exchange**: Staff creates an offer BEFORE subscribing to the channel, then sends it after subscription. But if the patient subscribes first and starts waiting, they might miss the initial offer broadcast.

2. **Patient Request-Offer Timing**: The patient only requests an offer once after 3 seconds if no offer received. If this fails, there's no retry mechanism.

3. **Offer Re-send on Presence Join**: When patient joins presence, staff resends the offer, but this only works if both are subscribed simultaneously.

### Issue 2: Remote Video Not Displayed

1. **Track Ready State Check**: The VideoPlayer checks `track.readyState === 'live'`, but remote tracks from WebRTC may initially have a different state and become "live" shortly after.

2. **Missing Track State Change Listener**: When a track transitions from "muted" to "unmuted" or changes ready state, the component doesn't always re-check.

3. **Stream Reference Issue**: Although we create new MediaStream objects, React may not detect the change properly because we're checking track states synchronously.

---

## Solution

### Fix 1: Improve Signaling Synchronization (useWebRTC.ts)

Add a polling mechanism for the patient to periodically request offers until one is received:

```text
Patient joins room
  -> Wait 2 seconds
  -> No offer? Request offer from staff
  -> Wait 3 seconds
  -> Still no offer? Request again
  -> Repeat up to 5 times
```

Also add a "ready" signal so both parties know when the other is fully subscribed.

### Fix 2: Fix Remote Video Display (VideoPlayer.tsx)

1. Remove the strict `readyState === 'live'` check for remote streams
2. Add a polling mechanism to re-check track states after initial render
3. Use `loadedmetadata` event on the video element to detect when video is ready to play
4. Handle the case where tracks become live asynchronously

---

## Implementation Details

### File: `src/hooks/useWebRTC.ts`

**Changes:**

1. Add periodic offer request for patient with multiple retries
2. Add "ready" broadcast event so both sides know when to exchange signals
3. Improve the offer resend logic on presence sync

```typescript
// Patient: Poll for offer if not received
const pollForOffer = () => {
  let pollCount = 0;
  const maxPolls = 5;
  
  const pollInterval = setInterval(() => {
    if (peerConnectionRef.current?.remoteDescription) {
      clearInterval(pollInterval);
      return;
    }
    
    pollCount++;
    if (pollCount >= maxPolls) {
      clearInterval(pollInterval);
      return;
    }
    
    console.log('[WebRTC] Polling for offer, attempt:', pollCount);
    channelRef.current?.send({
      type: 'broadcast',
      event: 'request-offer',
      payload: { from: 'patient' },
    });
  }, 3000);
  
  return pollInterval;
};
```

### File: `src/components/video/VideoPlayer.tsx`

**Changes:**

1. Add `loadedmetadata` and `loadeddata` event listeners to detect when video is ready
2. Add a delayed re-check of track states (100ms after stream change)
3. Treat remote streams more leniently - show video if tracks exist, even if not "live" yet
4. Add explicit handling for track `ended` state

```typescript
// After setting srcObject, wait for video metadata to load
videoElement.addEventListener('loadedmetadata', () => {
  console.log('[VideoPlayer] Video metadata loaded');
  setHasVideoTrack(true);
});

// Add a delayed state check for remote tracks
setTimeout(() => {
  const tracks = stream.getVideoTracks();
  if (tracks.length > 0) {
    setHasVideoTrack(true);
  }
}, 200);
```

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/hooks/useWebRTC.ts` | Add polling for offer, improve presence sync handling, add ready signal |
| `src/components/video/VideoPlayer.tsx` | Fix track state detection, add loadedmetadata handler, delayed re-check |

---

## Technical Details

### Signaling Flow After Fix

```text
Staff Flow:
1. Initialize media
2. Create peer connection
3. Create offer (store in ref)
4. Subscribe to signaling channel
5. On SUBSCRIBED: track presence, send "staff-ready" broadcast
6. When patient presence joins OR receives "patient-ready": send offer
7. Listen for answer, set remote description
8. Exchange ICE candidates

Patient Flow:
1. Initialize media  
2. Create peer connection
3. Subscribe to signaling channel
4. On SUBSCRIBED: track presence, send "patient-ready" broadcast
5. Start polling for offer every 3 seconds (up to 5 times)
6. When offer received: set remote description, create answer, send answer
7. Exchange ICE candidates
8. Stop polling when remote description set
```

### Video Display Flow After Fix

```text
1. Stream object set as srcObject
2. Set hasVideoTrack = true if any video tracks exist (lenient check)
3. Listen for 'loadedmetadata' event to confirm video ready
4. Poll track states every 500ms for first 3 seconds
5. Update hasVideoTrack based on any state changes
6. Handle mute/unmute/ended events
```

---

## Summary

The fix addresses both issues by:

1. **Connection reliability**: Adding a polling mechanism for offer requests, ensuring both parties signal "ready" state, and handling timing issues in presence sync

2. **Video display**: Removing strict track state checks, adding video element event listeners, and implementing delayed state verification for remote streams

This makes the video call more resilient to network timing variations and browser-specific WebRTC behaviors.
