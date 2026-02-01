

# Plan: Fix "This Room Has Ended" Error

## Root Cause Found

The problem is that your video rooms are being **permanently marked as "ended" too early**. Here's what's happening:

```text
1. You create a test room → status: "test" ✓
2. Staff & patient join → status: "active" ✓
3. Connection fails or briefly disconnects
4. Code calls onCallEnded() → status: "ended" ← BUG!
5. You try to reconnect
6. Backend says "This room has ended" ← You're stuck here
```

**The code is marking the room as "ended" on ANY connection failure**, even temporary ones. Once a room is marked "ended", it's permanently unusable.

---

## The Bug Location

In `src/hooks/useWebRTC.ts`, lines 260-269:

```typescript
} else if (pc.connectionState === 'disconnected') {
  setConnectionStatus('disconnected');
  setIsConnected(false);
  onCallEnded?.();  // ← This marks room as ENDED!
} else if (pc.connectionState === 'failed') {
  setConnectionStatus('failed');
  setConnectionError('...');
  setIsConnected(false);
  onCallEnded?.();  // ← This marks room as ENDED!
}
```

And in `VideoCallStaff.tsx`, `onCallEnded` triggers:
```typescript
await updateRoomStatus('ended', durationSeconds);
```

---

## Solution

### 1. Only Mark Room "Ended" on Intentional End

The room should ONLY be marked "ended" when:
- Staff clicks the "End Call" button
- NOT on connection failures
- NOT on temporary disconnections

### 2. Add Connection Recovery Without Ending Room

On connection failures, attempt recovery WITHOUT marking the room as ended:
- Show "reconnecting" status
- Allow retry without creating a new room
- Keep room status as "active" during recovery

### 3. Separate "Call Ended" vs "Connection Lost"

Create two distinct flows:
- **Intentional End**: User clicked end → mark room ended
- **Connection Lost**: Network issue → show reconnect option, keep room active

---

## Implementation Changes

### File 1: `src/hooks/useWebRTC.ts`

**Add new callback for connection failures (separate from call ended):**

```typescript
interface UseWebRTCOptions {
  roomCode: string;
  isStaff: boolean;
  onCallStarted?: () => void;
  onCallEnded?: () => void;
  onConnectionLost?: () => void;  // NEW - for failures
  onError?: (error: string) => void;
}
```

**Update connection state handler:**

```typescript
} else if (pc.connectionState === 'disconnected') {
  setConnectionStatus('disconnected');
  setIsConnected(false);
  // DON'T call onCallEnded - call new callback instead
  onConnectionLost?.();
} else if (pc.connectionState === 'failed') {
  setConnectionStatus('failed');
  setConnectionError('...');
  setIsConnected(false);
  // DON'T call onCallEnded - call new callback instead
  onConnectionLost?.();
}
```

**Only call onCallEnded on intentional end:**

```typescript
const endCall = () => {
  console.log('[WebRTC] Ending call intentionally');
  channelRef.current?.send({
    type: 'broadcast',
    event: 'end-call',
    payload: { from: isStaff ? 'staff' : 'patient' },
  });
  cleanup();
  onCallEnded?.();  // Only here - intentional end
};
```

### File 2: `src/pages/VideoCallStaff.tsx`

**Update WebRTC hook usage:**

```typescript
const webrtc = useWebRTC({
  roomCode: roomData?.room_code || '',
  isStaff: true,
  onCallStarted: () => {
    timer.start();
    updateRoomStatus('active');
  },
  onCallEnded: () => {
    // Only called on intentional end
    const finalSeconds = timer.stop();
    handleCallEnded(finalSeconds);
  },
  onConnectionLost: () => {
    // DON'T end the room - just show reconnect UI
    console.log('Connection lost, room remains active for retry');
    // Optionally show a toast
    toast({
      title: 'Connection Lost',
      description: 'Click "Try Again" to reconnect',
      variant: 'destructive',
    });
  },
  onError: (error) => {
    toast({ title: 'Error', description: error, variant: 'destructive' });
  },
});
```

### File 3: `src/pages/VideoCall.tsx`

**Same update for patient side:**

```typescript
const webrtc = useWebRTC({
  // ... existing options
  onConnectionLost: () => {
    // Don't trigger the ended flow - allow retry
    console.log('Connection lost, waiting for reconnect');
  },
});
```

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/hooks/useWebRTC.ts` | Add `onConnectionLost` callback, separate from `onCallEnded` |
| `src/pages/VideoCallStaff.tsx` | Handle connection lost without ending room |
| `src/pages/VideoCall.tsx` | Handle connection lost without ending call flow |

---

## Summary

This fix ensures:

1. **Room only ends when you click "End Call"** - not on failures
2. **Connection failures allow retry** - room stays active
3. **Reconnection is possible** - no more "room has ended" errors
4. **Clear separation** between intentional end and connection issues

After this fix, even if the connection fails multiple times, you can keep retrying until it works. The room will only be marked "ended" when someone intentionally clicks the End Call button.

