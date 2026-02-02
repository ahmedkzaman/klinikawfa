

# Plan: Fix Duplicate Offer Processing on Patient Side

## Problem Identified

After analyzing the code, I found the **root cause**: The broadcast offer handler on line 435-467 does NOT check `offerProcessedRef.current` before processing the offer.

### What's Happening

```text
Patient joins call:
1. Database poll starts (every 800ms)
2. Broadcast listener is active
3. Staff sends offer

Race condition:
├── Path A: Broadcast arrives → calls setRemoteDescription() immediately
└── Path B: Database poll finds offer → also tries setRemoteDescription()

Result: Second call to setRemoteDescription() throws error:
"Failed to execute 'setRemoteDescription' on 'RTCPeerConnection': 
 Failed to set remote answer sdp: Called in wrong state: have-remote-offer"
```

The error "failed to process call offer at patient side" comes from the catch block at line 464, which triggers when `setRemoteDescription` fails due to the duplicate processing attempt.

---

## Root Cause: Missing Deduplication Check

**Database fallback handler (line 779)** - HAS protection:
```typescript
if (data?.current_offer && !offerProcessedRef.current && !peerConnectionRef.current?.remoteDescription) {
  offerProcessedRef.current = true;  // ✓ Sets flag FIRST
  // ... process offer
}
```

**Broadcast handler (line 435)** - MISSING protection:
```typescript
.on('broadcast', { event: 'offer' }, async ({ payload }) => {
  if (!isStaff && payload.from === 'staff') {
    // ✗ NO CHECK for offerProcessedRef.current
    await pc.setRemoteDescription(...);  // Can fail if already processed!
  }
})
```

---

## Solution

Add the same deduplication check to the broadcast handler:

### Fix in Broadcast Offer Handler

```typescript
.on('broadcast', { event: 'offer' }, async ({ payload }) => {
  if (!isStaff && payload.from === 'staff') {
    // CRITICAL FIX: Check if offer already processed (by DB fallback or previous broadcast)
    if (offerProcessedRef.current || pc.remoteDescription) {
      console.log('[WebRTC] Offer already processed, ignoring duplicate');
      return;
    }
    
    // Mark as processed BEFORE async operations to prevent race
    offerProcessedRef.current = true;
    
    console.log('[WebRTC] Received offer from staff', payload.iceRestart ? '(ICE restart)' : '');
    try {
      await pc.setRemoteDescription(new RTCSessionDescription(payload.offer));
      // ... rest of handler
    } catch (err) {
      // Reset flag on error so retry can work
      offerProcessedRef.current = false;
      console.error('[WebRTC] Error handling offer:', err);
      onError?.('Failed to process call offer');
    }
  }
})
```

### Additional Safety: Check PC State Before Processing

```typescript
// Also check peer connection state - if already have remote description, skip
if (pc.signalingState !== 'stable' && pc.signalingState !== 'have-local-offer') {
  // Only process offer in valid states
}
```

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/hooks/useWebRTC.ts` | Add deduplication check to broadcast offer handler (lines 435-467) |

---

## Implementation Details

1. **Add check at start of broadcast handler**: `if (offerProcessedRef.current || pc.remoteDescription) return;`
2. **Set flag before async work**: `offerProcessedRef.current = true;` before `setRemoteDescription`
3. **Reset flag on error**: Allow retry if processing fails
4. **ICE restart handling**: Allow ICE restart offers even if previously processed by checking `payload.iceRestart`

---

## Why This Will Fix the Error

The error "failed to process call offer at patient side" occurs when:
1. Database poll processes the offer first
2. Broadcast handler then tries to process the same offer
3. `setRemoteDescription` fails because PC already has a remote description

Adding the deduplication check ensures only ONE path processes the offer, eliminating the race condition.

