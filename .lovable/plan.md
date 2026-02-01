

# Plan: Fix Intermittent "Failed to Establish Connection" Error

## Problem Analysis

The "failed to establish connection" error occurs intermittently due to timing issues in the WebRTC signaling process. The error specifically comes from line 388 in `useWebRTC.ts` when the staff fails to process the patient's answer.

### Why It's Intermittent

The connection works "sometimes" because the timing of signaling messages (offer/answer/ICE candidates) is unpredictable. When both parties happen to be ready at the same time, it works. When there's a timing mismatch, it fails.

**Key issues identified:**

| Issue | Impact |
|-------|--------|
| Offer sent before patient subscribes | Patient never receives offer |
| Answer arrives before staff ready | Staff fails to set remote description |
| ICE candidates arrive before remote description | Candidates get queued but may be stale |
| No signaling confirmation | No way to know if messages were received |
| Single retry for answer handling | One failure = complete failure |

---

## Solution: Robust Signaling with Acknowledgements

### 1. Add Signaling Acknowledgements

Both parties should confirm they received critical messages:

```text
Staff                          Patient
  |                               |
  |-- offer ---------------------->|
  |<-- offer-received -------------|
  |                               |
  |<-- answer --------------------|
  |-- answer-received ------------>|
  |                               |
  [Connection established]
```

### 2. Auto-Retry for Failed Answer Processing

If staff fails to set remote description from answer, automatically request a new answer:

```typescript
// In answer handler
.on('broadcast', { event: 'answer' }, async ({ payload }) => {
  if (isStaff && payload.from === 'patient') {
    try {
      await pc.setRemoteDescription(...);
      // Send acknowledgement
      channel.send({ type: 'broadcast', event: 'answer-received', payload: {} });
    } catch (err) {
      console.error('[WebRTC] Answer failed, requesting new one');
      channel.send({ type: 'broadcast', event: 'request-answer', payload: {} });
    }
  }
});
```

### 3. ICE Connection Restart

When ICE connection fails, attempt an ICE restart instead of requiring full reconnection:

```typescript
pc.oniceconnectionstatechange = () => {
  if (pc.iceConnectionState === 'failed') {
    console.log('[WebRTC] ICE failed, attempting restart');
    pc.restartIce();
    // Create new offer with ICE restart
    const offer = await pc.createOffer({ iceRestart: true });
    // ... send new offer
  }
};
```

### 4. Exponential Backoff for Offer Resends

Instead of fixed 3-second intervals, use exponential backoff with jitter:

```typescript
// Start at 1s, then 2s, 4s, 8s, 16s (with random jitter)
const delay = Math.min(1000 * Math.pow(2, pollCount), 16000);
const jitter = Math.random() * 500;
setTimeout(requestOffer, delay + jitter);
```

### 5. Connection State Timeout

If stuck in "connecting" state for too long, auto-retry:

```typescript
// Set a timeout when entering 'connecting' state
const connectionTimeout = setTimeout(() => {
  if (pc.connectionState === 'connecting') {
    console.log('[WebRTC] Connection timeout, retrying');
    retryCall();
  }
}, 30000); // 30 second timeout
```

---

## Implementation Details

### File: `src/hooks/useWebRTC.ts`

**Changes:**

1. **Add acknowledgement events** for offer and answer
2. **Add answer retry logic** when setRemoteDescription fails
3. **Add ICE restart** on ICE connection failure
4. **Improve offer polling** with exponential backoff
5. **Add connection timeout** to detect stuck connections
6. **Better error messages** to help debugging

### New Signaling Events

| Event | Sender | Purpose |
|-------|--------|---------|
| `offer-received` | Patient | Confirm offer was received |
| `answer-received` | Staff | Confirm answer was received |
| `request-answer` | Staff | Request patient to resend answer |
| `resend-offer` | Staff | Send offer again after failure |

### Error Handling Improvements

```typescript
// Before (single point of failure)
} catch (err) {
  onError?.('Failed to establish connection');
}

// After (retry with exponential backoff)
} catch (err) {
  console.error('[WebRTC] Answer failed, attempt', retryCount);
  if (retryCount < 3) {
    retryCount++;
    await delay(1000 * retryCount);
    channel.send({ event: 'request-answer', ... });
  } else {
    onError?.('Failed to establish connection after multiple attempts');
  }
}
```

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/hooks/useWebRTC.ts` | Add acknowledgements, retry logic, ICE restart, connection timeout |

---

## Technical Details

### ICE Restart Flow

```text
1. ICE connection fails (iceConnectionState === 'failed')
2. Call pc.restartIce()
3. Create new offer with { iceRestart: true }
4. Send new offer to peer
5. Peer creates new answer
6. Exchange new ICE candidates
7. Connection re-established
```

### Connection Timeout Flow

```text
1. startCall() begins
2. connectionStatus = 'connecting-to-room'
3. Start 30-second timeout
4. If 'connected' before timeout → cancel timeout
5. If timeout fires → cleanup() + retry with error message
```

### Exponential Backoff for Offers

```text
Poll 1: 1000ms + jitter
Poll 2: 2000ms + jitter  
Poll 3: 4000ms + jitter
Poll 4: 8000ms + jitter
Poll 5: 16000ms + jitter
```

---

## Summary

This fix addresses the intermittent connection failures by:

1. **Adding acknowledgements** - Know when messages are received
2. **Auto-retry answer processing** - Don't fail on first error
3. **ICE restart capability** - Recover from ICE failures without full reconnect
4. **Better polling** - Exponential backoff reduces race conditions
5. **Connection timeout** - Detect and recover from stuck states

These changes make the signaling process more resilient to network timing issues and Supabase Realtime variability.

