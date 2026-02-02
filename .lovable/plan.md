

# Plan: Fix Patient Unable to Connect to Doctor

## Problem Found

The room is staying `active` (our previous fix worked!), but the WebRTC connection is failing due to a **signaling race condition**. Here's what's happening:

```text
1. Doctor clicks "Start Call"
2. Doctor creates offer, joins channel, sends offer immediately
3. Patient clicks "Join Call" 
4. Patient is still setting up their channel subscription
5. Doctor's offer arrives BEFORE patient finishes subscribing
6. Patient MISSES the offer completely
7. Patient starts polling with setTimeout, but...
8. The polling delays (1s, 2s, 4s...) may be too slow
9. Both sides wait forever - connection fails
```

## Root Cause

In `setupSignaling`, the `sendOffer()` helper checks `channelRef.current`, but this reference is only set AFTER `channel.track()` succeeds. Meanwhile:

- The initial offer is sent immediately after signaling setup
- But the patient may still be in their own `subscribe()` call
- Supabase Realtime broadcasts are NOT guaranteed to be received if the recipient isn't fully subscribed yet

## Solution

### Fix 1: Staff Must Wait for Patient Presence Before Sending Offer

Currently the staff sends the offer immediately. Instead, staff should:
1. Join the channel
2. Wait until patient's presence is detected
3. THEN send the offer

```typescript
// In staff flow after signaling setup
if (isStaff) {
  // Start a presence-based offer sending loop
  const checkAndSendOffer = () => {
    const state = channelRef.current?.presenceState() || {};
    const hasPatient = Object.keys(state).some(key => 
      key === 'patient' || state[key]?.some?.((p: any) => p.role === 'patient')
    );
    
    if (hasPatient && currentOfferRef.current) {
      console.log('[WebRTC] Patient detected, sending offer');
      sendOffer();
    } else {
      // Keep checking every 500ms
      setTimeout(checkAndSendOffer, 500);
    }
  };
  
  // Start checking after 1 second
  setTimeout(checkAndSendOffer, 1000);
}
```

### Fix 2: Patient Should Request Offer IMMEDIATELY on Subscribe

Currently patient waits 1 second before first poll. This should be immediate:

```typescript
// Patient should request offer as soon as channel is subscribed
if (!isStaff) {
  // Request immediately, not after 1 second
  channel.send({
    type: 'broadcast',
    event: 'request-offer',
    payload: { from: 'patient' },
  });
}
```

### Fix 3: Improve Presence-Based Offer Trigger

The presence `join` event handler should be more reliable:

```typescript
.on('presence', { event: 'join' }, ({ newPresences }) => {
  console.log('[WebRTC] Presence join:', newPresences);
  
  // Check if patient joined
  const patientJoined = newPresences?.some((p: any) => 
    p.role === 'patient' || p.presence_ref?.includes('patient')
  );
  
  if (isStaff && patientJoined && currentOfferRef.current) {
    console.log('[WebRTC] Patient presence detected, sending offer');
    // Send offer immediately
    sendOffer();
    // And again after 500ms to ensure delivery
    setTimeout(sendOffer, 500);
  }
})
```

### Fix 4: More Aggressive Initial Polling

Patient should poll more aggressively at first:

```typescript
// First 3 polls at 500ms, then exponential backoff
const getDelay = (count: number) => {
  if (count <= 3) return 500; // Fast initial polling
  return Math.min(1000 * Math.pow(2, count - 3), 16000);
};
```

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/hooks/useWebRTC.ts` | Fix signaling timing, add presence-based offer sending, faster initial polling |

---

## Implementation Summary

1. **Staff waits for patient presence** before sending initial offer
2. **Patient requests offer immediately** on subscribe (not after 1s delay)
3. **Staff resends offer on presence join** with a backup delayed resend
4. **Patient polls faster initially** (500ms for first 3 attempts)
5. **Both sides handle "ready" signals** more reliably

This ensures that regardless of who joins first, the offer will be delivered once both parties are subscribed.

