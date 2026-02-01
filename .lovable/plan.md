

# Plan: Fix "Failed to start video call" Error

## Root Cause Analysis

After tracing through the code, I identified **the key timing issue**:

### The Bug

In `setupSignaling()`, we set up event listeners for presence BEFORE the offer is created:

```text
CURRENT FLOW (BROKEN):
=======================
1. Staff calls startCall()
2. Staff calls initializeMedia() ✓
3. Staff calls createPeerConnection() ✓
4. Staff calls await setupSignaling():
   → Sets up presence listener: if (isStaff && currentOfferRef.current) {...}
   → currentOfferRef.current = null at this point!
   → Patient may already be in room, presence event fires
   → But currentOfferRef.current is STILL null, so offer is NOT sent
5. AFTER setupSignaling resolves, offer is created
6. currentOfferRef.current is NOW set, but presence event already fired
7. Neither side can connect → "Failed to start video call"
```

### Additional Issues

1. **Subscription status handling**: Only `SUBSCRIBED` and `CHANNEL_ERROR` are handled. Other statuses like `CLOSED` or `TIMED_OUT` aren't handled.

2. **Double timeout risk**: The subscription timeout can race with the channel status change.

3. **No retry mechanism**: If the initial connection fails, there's no way to retry.

---

## Solution

Fix the timing by moving offer creation BEFORE setting up the signaling channel, and add better error handling.

---

## Implementation Steps

### Step 1: Restructure the Call Flow

Move offer creation BEFORE signaling setup:

```text
NEW FLOW (FIXED):
==================
1. Staff calls startCall()
2. Staff calls initializeMedia() ✓
3. Staff calls createPeerConnection() ✓
4. Staff creates offer and stores it in currentOfferRef.current ✓
5. Staff calls await setupSignaling():
   → Sets up presence listener
   → Patient joins, presence event fires
   → currentOfferRef.current HAS THE OFFER → sends offer ✓
6. Connection succeeds!
```

### Step 2: Improve Error Handling

Add handling for all subscription statuses and better cleanup on failure.

### Step 3: Add Better Logging

Add more descriptive error messages to help debug issues.

---

## Technical Details

### Changes to `src/hooks/useWebRTC.ts`:

**1. In `startCall()`, create offer BEFORE signaling:**

```typescript
const startCall = async () => {
  console.log('[WebRTC] Starting call as', isStaff ? 'staff' : 'patient');
  setIsConnecting(true);
  
  try {
    const stream = await initializeMedia();
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
    
    // Now set up signaling (presence events will have access to offer)
    await setupSignaling(pc);
    console.log('[WebRTC] Signaling channel ready');

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
    cleanup(); // Clean up on failure
    setIsConnecting(false);
    onError?.(err instanceof Error ? err.message : 'Failed to start video call');
  }
};
```

**2. Improve subscription status handling:**

```typescript
.subscribe(async (status) => {
  console.log('[WebRTC] Channel subscription status:', status);
  if (status === 'SUBSCRIBED') {
    const role = isStaff ? 'staff' : 'patient';
    console.log('[WebRTC] Tracking presence as:', role);
    try {
      await channel.track({ role, online_at: Date.now() });
      channelRef.current = channel;
      resolve();
    } catch (err) {
      console.error('[WebRTC] Failed to track presence:', err);
      reject(new Error('Failed to join room'));
    }
  } else if (status === 'CHANNEL_ERROR' || status === 'CLOSED' || status === 'TIMED_OUT') {
    console.error('[WebRTC] Channel error:', status);
    reject(new Error(`Failed to join signaling channel: ${status}`));
  }
});
```

**3. Add cleanup on error in `startCall()`:**

After the catch block, ensure all resources are cleaned up so the user can retry.

---

## Visual Flow After Fix

```text
Staff clicks "Start Call"
        ↓
Initialize media (camera/mic)
        ↓
Create peer connection
        ↓
Create WebRTC offer ← MOVED EARLIER
Store in currentOfferRef
        ↓
Setup signaling channel
Subscribe to realtime
        ↓
If patient already present:
  → Presence event fires
  → currentOfferRef HAS offer ✓
  → Send offer to patient ✓
        ↓
Patient receives offer
Patient sends answer
        ↓
Connection established!
```

---

## Files to Modify

1. **`src/hooks/useWebRTC.ts`**:
   - Move offer creation before `setupSignaling()` call
   - Add handling for `CLOSED` and `TIMED_OUT` subscription statuses
   - Add cleanup on error in `startCall()`
   - Improve error messages to be more descriptive

---

## Summary

The video call fails because the WebRTC offer is created AFTER setting up the signaling channel, but the presence event listener (which sends the offer) is set up DURING signaling setup. By moving offer creation BEFORE signaling setup, the offer will be ready when presence events fire, and the connection will succeed.

