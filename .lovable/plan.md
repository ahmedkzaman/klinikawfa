

# Plan: Fix Persistent Connection Failures

## Problem Identified

After analyzing the code thoroughly, I found the **critical issue**: The WebRTC signaling is unreliable because Supabase Realtime broadcasts can be **silently dropped** when the recipient hasn't fully subscribed yet, even with our presence checks.

### Current Flow Has a Fatal Flaw

```text
Staff: createOffer() -> setupSignaling() -> subscribe() -> SUBSCRIBED -> track() -> sends offer
Patient: setupSignaling() -> subscribe() ... (still subscribing)
                                          -> SUBSCRIBED -> track() -> request-offer

PROBLEM: Staff's offer may arrive DURING patient's subscribe() phase
         Supabase Realtime doesn't queue messages for not-yet-subscribed clients!
```

Even with presence-based offer sending, there's still a timing window where:
1. Staff detects patient presence
2. Staff sends offer
3. Patient is processing presence track (not listening to broadcasts yet)
4. Offer is lost

---

## Root Cause: Missing Database Fallback

The Lovable Stack Overflow insight is correct: **Realtime alone is unreliable**. We need a database-backed signaling fallback.

Current approach: Rely 100% on Realtime broadcasts
Required approach: Realtime + Database polling fallback

---

## Solution: Hybrid Signaling with Database Persistence

### 1. Store Offers in Database

When staff creates an offer, save it to the `video_rooms` table:

```sql
-- Add column to store the current offer
ALTER TABLE video_rooms ADD COLUMN current_offer JSONB;
```

### 2. Staff: Save Offer to Database + Broadcast

```typescript
// After creating offer, save to DB
await supabase.from('video_rooms')
  .update({ current_offer: offer })
  .eq('room_code', roomCode);

// Also broadcast (for instant delivery if patient is ready)
channel.send({ type: 'broadcast', event: 'offer', payload: { offer } });
```

### 3. Patient: Poll Database as Fallback

```typescript
// If no offer received via broadcast, check database
const pollDatabaseForOffer = async () => {
  const { data } = await supabase
    .from('video_rooms')
    .select('current_offer')
    .eq('room_code', roomCode)
    .single();
  
  if (data?.current_offer) {
    // Process the offer from database
    await handleOffer(data.current_offer);
  }
};
```

### 4. Combined Approach

```text
Staff Flow:
1. Create offer
2. Save to database (persistent)
3. Broadcast via Realtime (fast)
4. Resend on patient presence

Patient Flow:
1. Subscribe to channel
2. Request offer via broadcast
3. ALSO poll database every 500ms
4. Stop polling once offer received
5. Process first offer received (broadcast OR database)
```

---

## Implementation

### File 1: Database Migration

Add `current_offer` column to `video_rooms` table to persist the WebRTC offer.

### File 2: `src/hooks/useWebRTC.ts`

Changes:
- Staff saves offer to database after creating it
- Patient polls database for offer as fallback
- Clear offer from database when call ends
- Add deduplication to prevent processing same offer twice

### Key Code Changes

**Staff side - save offer:**
```typescript
// After pc.setLocalDescription(offer)
currentOfferRef.current = offer;

// CRITICAL: Persist offer to database for reliability
try {
  await supabase.from('video_rooms')
    .update({ current_offer: offer })
    .eq('room_code', roomCode);
  console.log('[WebRTC] Offer saved to database');
} catch (err) {
  console.error('[WebRTC] Failed to save offer to DB:', err);
}
```

**Patient side - database polling fallback:**
```typescript
// Poll database for offer as fallback
const pollDatabaseForOffer = async () => {
  if (peerConnectionRef.current?.remoteDescription) return; // Already got it
  
  const { data } = await supabase
    .from('video_rooms')
    .select('current_offer')
    .eq('room_code', roomCode)
    .single();
  
  if (data?.current_offer && !peerConnectionRef.current?.remoteDescription) {
    console.log('[WebRTC] Got offer from database fallback');
    await processOffer(data.current_offer);
  }
};

// Start polling alongside broadcast listening
const dbPollInterval = setInterval(pollDatabaseForOffer, 800);
```

---

## Files to Modify

| File | Changes |
|------|---------|
| Database Migration | Add `current_offer JSONB` column to `video_rooms` |
| `src/hooks/useWebRTC.ts` | Save offer to DB, poll DB as fallback |

---

## Why This Will Work

1. **Database is persistent** - Offer won't be lost even if patient joins late
2. **Dual delivery** - Broadcast for speed, database for reliability
3. **Automatic deduplication** - Check `remoteDescription` before processing
4. **No timing dependency** - Patient can always get offer from database

This is the proven pattern from the troubleshooting guide: "Realtime is fast but unreliable; polling is slower but guaranteed. Use both for critical data."

---

## Summary

The fix adds a database-backed fallback for WebRTC signaling:

1. Staff **saves offer to database** after creating it
2. Patient **polls database** as fallback if broadcast is missed
3. **First one wins** - whether from broadcast or database
4. **100% reliable** - database always has the offer

This eliminates the race condition because the patient can ALWAYS retrieve the offer from the database, even if they missed the broadcast.

