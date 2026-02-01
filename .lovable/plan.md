

# Plan: Fix Video Call Connection - Staff and Patient Can't See Each Other

## Problem Identified

After analyzing the WebRTC implementation, I found **two critical issues** preventing the video connection:

### Issue 1: Supabase Realtime Channel Not Ready Before Sending Offer

In `useWebRTC.ts`, the staff side subscribes to the channel and immediately sends the offer after a 1-second timeout, but:
- The `.subscribe()` method is called but the code doesn't wait for it to confirm the subscription is active
- The offer may be sent before the channel is fully subscribed
- More importantly, **the patient may not have joined the channel yet** when the offer is sent

```typescript
// Current problematic code (lines 207-233)
channel.subscribe();  // <-- Doesn't wait for subscription to be ready
channelRef.current = channel;

// Staff sends offer after 1 second
if (isStaff) {
  setTimeout(() => {
    channelRef.current?.send({ ... offer ... });  // Patient may not be subscribed yet!
  }, 1000);
}
```

### Issue 2: Timing Race Condition

The current flow has a fundamental timing problem:

```text
CURRENT (BROKEN) FLOW:
========================
Staff clicks "Start Call"
    |
    v
Staff subscribes to channel
Staff creates offer
Staff sends offer (after 1 sec)     <-- Patient may not be ready!
    |
    v
Patient clicks "Join Call" (later)
Patient subscribes to channel       <-- MISSED THE OFFER!
Patient waits for offer...          <-- Never receives it
    |
    v
Both stuck waiting forever
```

---

## Solution

Fix the signaling to properly handle the timing issue:

1. **Wait for subscription to be confirmed** before proceeding
2. **Implement a "presence" system** so staff knows when patient has joined
3. **Re-send the offer** when patient joins the channel
4. **Add reconnection logic** for robustness

---

## Implementation Steps

### Step 1: Update `useWebRTC.ts` - Wait for Subscription

Subscribe to the channel and wait for confirmation before proceeding.

```typescript
const setupSignaling = async (pc: RTCPeerConnection): Promise<void> => {
  return new Promise((resolve, reject) => {
    const channel = supabase.channel(`video-room-${roomCode}`);

    channel
      .on('presence', { event: 'join' }, ({ key, newPresences }) => {
        // When the other party joins, re-send offer if we're staff
        if (isStaff && newPresences.some(p => p.role === 'patient')) {
          sendOffer();
        }
      })
      .on('broadcast', { event: 'offer' }, ...)
      .on('broadcast', { event: 'answer' }, ...)
      .on('broadcast', { event: 'ice-candidate' }, ...)
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          // Track presence
          await channel.track({ role: isStaff ? 'staff' : 'patient' });
          channelRef.current = channel;
          resolve();
        } else if (status === 'CHANNEL_ERROR') {
          reject(new Error('Failed to join signaling channel'));
        }
      });
  });
};
```

### Step 2: Re-send Offer When Patient Joins

Staff should detect when patient joins and send the offer at that moment.

```typescript
// Store offer for re-sending
const currentOfferRef = useRef<RTCSessionDescriptionInit | null>(null);

const sendOffer = () => {
  if (currentOfferRef.current && channelRef.current) {
    channelRef.current.send({
      type: 'broadcast',
      event: 'offer',
      payload: { offer: currentOfferRef.current, from: 'staff' },
    });
  }
};

// When creating offer, store it
const offer = await pc.createOffer();
await pc.setLocalDescription(offer);
currentOfferRef.current = offer;
```

### Step 3: Patient Requests Offer if Missed

If patient joins and doesn't receive an offer, they should request it.

```typescript
// Add request-offer event
.on('broadcast', { event: 'request-offer' }, () => {
  if (isStaff) {
    sendOffer();
  }
})

// Patient sends request when joining
if (!isStaff) {
  setTimeout(() => {
    if (!pc.remoteDescription) {
      channel.send({
        type: 'broadcast',
        event: 'request-offer',
        payload: { from: 'patient' },
      });
    }
  }, 2000);
}
```

---

## Updated Flow After Fix

```text
FIXED FLOW:
===========
Staff clicks "Start Call"
    |
    v
Staff subscribes to channel (waits for SUBSCRIBED)
Staff tracks presence (role: staff)
Staff creates offer and stores it
    |
    v
Patient clicks "Join Call" 
Patient subscribes to channel (waits for SUBSCRIBED)
Patient tracks presence (role: patient)
    |
    v
Staff receives presence event (patient joined)
Staff sends offer to patient
    |
    v
Patient receives offer
Patient creates answer
Patient sends answer
    |
    v
Both exchange ICE candidates
Connection established!
Both can see each other!
```

---

## Files to Modify

1. **`src/hooks/useWebRTC.ts`** - Main changes:
   - Wait for channel subscription to be confirmed
   - Add presence tracking
   - Re-send offer when patient joins
   - Add request-offer fallback mechanism
   - Better error handling and logging

---

## Technical Details

### Key Changes in `useWebRTC.ts`:

```typescript
// 1. Add ref to store current offer
const currentOfferRef = useRef<RTCSessionDescriptionInit | null>(null);

// 2. Update setupSignaling to return a Promise
const setupSignaling = (pc: RTCPeerConnection): Promise<void> => {
  return new Promise((resolve, reject) => {
    const channel = supabase.channel(`video-room-${roomCode}`, {
      config: { presence: { key: isStaff ? 'staff' : 'patient' } }
    });

    // Helper to send offer
    const sendOffer = () => {
      if (currentOfferRef.current) {
        console.log('Sending offer to patient');
        channel.send({
          type: 'broadcast',
          event: 'offer',
          payload: { offer: currentOfferRef.current, from: 'staff' },
        });
      }
    };

    channel
      // When other party joins, staff re-sends offer
      .on('presence', { event: 'join' }, ({ newPresences }) => {
        console.log('Presence join:', newPresences);
        if (isStaff) {
          // Patient joined, send offer
          sendOffer();
        }
      })
      // Patient can request offer if they missed it
      .on('broadcast', { event: 'request-offer' }, ({ payload }) => {
        if (isStaff && payload.from === 'patient') {
          console.log('Patient requested offer');
          sendOffer();
        }
      })
      // ... existing offer/answer/ice-candidate handlers
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          console.log('Channel subscribed successfully');
          await channel.track({ online_at: Date.now() });
          channelRef.current = channel;
          resolve();
        } else if (status === 'CHANNEL_ERROR') {
          reject(new Error('Failed to subscribe to channel'));
        }
      });

    // Timeout for subscription
    setTimeout(() => {
      if (!channelRef.current) {
        reject(new Error('Channel subscription timeout'));
      }
    }, 10000);
  });
};

// 3. Update startCall to await signaling setup
const startCall = async () => {
  setIsConnecting(true);
  
  try {
    const stream = await initializeMedia();
    const pc = createPeerConnection(stream);
    
    // Wait for channel to be ready
    await setupSignaling(pc);

    if (isStaff) {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      currentOfferRef.current = offer;
      
      // Send offer immediately (other party may already be waiting)
      channelRef.current?.send({
        type: 'broadcast',
        event: 'offer',
        payload: { offer, from: 'staff' },
      });
    } else {
      // Patient: request offer after a delay if not received
      setTimeout(() => {
        if (!pc.remoteDescription) {
          console.log('No offer received, requesting...');
          channelRef.current?.send({
            type: 'broadcast',
            event: 'request-offer',
            payload: { from: 'patient' },
          });
        }
      }, 3000);
    }
  } catch (err) {
    console.error('Failed to start call:', err);
    setIsConnecting(false);
    onError?.('Failed to start video call');
  }
};
```

---

## Summary

The video call isn't working because:
1. The signaling channel subscription isn't being awaited
2. The offer is sent before the patient has joined the channel
3. There's no mechanism to re-send the offer when the patient connects

The fix adds:
- Proper subscription confirmation before sending messages
- Presence tracking to detect when both parties are connected
- Automatic re-sending of offer when patient joins
- A fallback mechanism for patient to request the offer

