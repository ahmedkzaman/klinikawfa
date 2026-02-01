

# Plan: Connection Status Indicator, Retry Button, and Video Call Testing

## Overview

This plan addresses three improvements to the video call system:
1. **Connection status indicator** - Show detailed status during call setup
2. **Retry button** - Allow users to retry when connection fails
3. **Testing guidance** - How to verify the signaling channel fix

---

## Feature 1: Connection Status Indicator

### Current State
- Only shows "Waiting for doctor..." or "Waiting for patient..." text
- No visibility into which step of the connection process is happening
- Users don't know if connection is progressing or stuck

### Proposed Status Stages

```text
┌─────────────────────────────────────────────────────────┐
│  Connection Status Flow                                  │
├─────────────────────────────────────────────────────────┤
│  1. "Initializing camera and microphone..."             │
│  2. "Connecting to room..."                             │
│  3. "Waiting for [doctor/patient] to join..."           │
│  4. "Establishing connection..."                         │
│  5. "Connected!" (success)                              │
│     OR                                                   │
│     "Connection failed" (error with retry button)        │
└─────────────────────────────────────────────────────────┘
```

### Implementation

**1. Add new state to `useWebRTC.ts`:**

```typescript
type ConnectionStatus = 
  | 'idle'
  | 'initializing-media'
  | 'connecting-to-room'
  | 'waiting-for-peer'
  | 'establishing-connection'
  | 'connected'
  | 'failed'
  | 'disconnected';

// Add to hook return
connectionStatus: ConnectionStatus;
connectionError: string | null;
```

**2. Create a new `ConnectionStatusIndicator` component:**

```typescript
// src/components/video/ConnectionStatusIndicator.tsx
interface ConnectionStatusIndicatorProps {
  status: ConnectionStatus;
  error: string | null;
  onRetry: () => void;
  isStaff: boolean;
}

export function ConnectionStatusIndicator({
  status,
  error,
  onRetry,
  isStaff,
}: ConnectionStatusIndicatorProps) {
  const getStatusMessage = () => {
    switch (status) {
      case 'initializing-media':
        return 'Initializing camera and microphone...';
      case 'connecting-to-room':
        return 'Connecting to room...';
      case 'waiting-for-peer':
        return isStaff ? 'Waiting for patient...' : 'Waiting for doctor...';
      case 'establishing-connection':
        return 'Establishing connection...';
      case 'connected':
        return 'Connected!';
      case 'failed':
        return 'Connection failed';
      case 'disconnected':
        return 'Disconnected';
      default:
        return null;
    }
  };
  // ... render with progress dots, error message, retry button
}
```

---

## Feature 2: Retry Button

### Current State
- When connection fails, user sees an error toast but can't retry
- User must refresh the page to try again

### Implementation

**1. Add `retryCall` function to `useWebRTC.ts`:**

```typescript
const retryCall = useCallback(async () => {
  // Clean up any existing connection
  cleanup();
  
  // Reset error state
  setConnectionError(null);
  setConnectionStatus('idle');
  
  // Start fresh
  await startCall();
}, [cleanup, startCall]);
```

**2. Add retry button to error states:**

In both `VideoCall.tsx` and `VideoCallStaff.tsx`:
- Show retry button when `connectionStatus === 'failed'`
- Style prominently with clear call-to-action

---

## Feature 3: Testing the Video Call

### Test Procedure

1. **Staff side:**
   - Log in as admin/staff
   - Go to Admin > Video Calls
   - Create a new room for a patient
   - Click "Join Call" to open staff video page

2. **Patient side:**
   - Open a different browser or incognito window
   - Go to the video call patient link
   - Enter room code and proceed through payment (or use test mode)
   - Click "Join Call"

3. **Expected behavior after fixes:**
   - Both sides should show progressive connection status
   - Staff should see "Waiting for patient..."
   - Patient should see "Waiting for doctor..."
   - Once both are connected, video/audio should work
   - If connection fails, retry button should appear

---

## Files to Modify

### 1. `src/hooks/useWebRTC.ts`
- Add `connectionStatus` state with detailed stages
- Add `connectionError` state
- Add `retryCall` function
- Update `startCall` to set status at each stage
- Return new state and functions

### 2. New: `src/components/video/ConnectionStatusIndicator.tsx`
- Create new component showing connection progress
- Include animated status indicator (dots/spinner)
- Show error message with retry button when failed
- Support bilingual (English/Malay)

### 3. `src/components/video/index.ts`
- Export the new ConnectionStatusIndicator component

### 4. `src/pages/VideoCall.tsx`
- Import and use ConnectionStatusIndicator
- Replace simple "Waiting for doctor..." text
- Add retry functionality

### 5. `src/pages/VideoCallStaff.tsx`
- Import and use ConnectionStatusIndicator
- Replace simple "Waiting for patient..." text
- Add retry functionality

---

## Technical Details

### Updated `useWebRTC.ts` State Management:

```typescript
// Add new state
const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('idle');
const [connectionError, setConnectionError] = useState<string | null>(null);

// Update startCall to set status at each stage
const startCall = async () => {
  setConnectionStatus('initializing-media');
  setConnectionError(null);
  setIsConnecting(true);
  
  try {
    const stream = await initializeMedia();
    
    setConnectionStatus('connecting-to-room');
    const pc = createPeerConnection(stream);
    
    if (isStaff) {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      currentOfferRef.current = offer;
    }
    
    await setupSignaling(pc);
    
    setConnectionStatus('waiting-for-peer');
    
    // ... rest of logic
  } catch (err) {
    setConnectionStatus('failed');
    setConnectionError(err instanceof Error ? err.message : 'Connection failed');
    cleanup();
    setIsConnecting(false);
    onError?.(err instanceof Error ? err.message : 'Failed to start video call');
  }
};

// Update connection state handler
pc.onconnectionstatechange = () => {
  if (pc.connectionState === 'connected') {
    setConnectionStatus('connected');
    setIsConnected(true);
    // ...
  } else if (pc.connectionState === 'connecting') {
    setConnectionStatus('establishing-connection');
  } else if (pc.connectionState === 'failed') {
    setConnectionStatus('failed');
    setConnectionError('Connection to peer failed');
    // ...
  }
};

// Add retry function
const retryCall = useCallback(async () => {
  cleanup();
  setConnectionError(null);
  setConnectionStatus('idle');
  await startCall();
}, [cleanup]);

// Return new values
return {
  // ... existing
  connectionStatus,
  connectionError,
  retryCall,
};
```

### ConnectionStatusIndicator Component Design:

```text
┌────────────────────────────────────────────┐
│                                            │
│       ⬤ ○ ○ ○  (progress indicator)       │
│                                            │
│    Connecting to room...                   │
│                                            │
└────────────────────────────────────────────┘

OR (on failure):

┌────────────────────────────────────────────┐
│                                            │
│           ⚠️ (error icon)                  │
│                                            │
│    Connection failed                       │
│    Camera/microphone not found             │
│                                            │
│    ┌──────────────────┐                    │
│    │   Try Again      │                    │
│    └──────────────────┘                    │
│                                            │
└────────────────────────────────────────────┘
```

---

## Summary

| File | Changes |
|------|---------|
| `src/hooks/useWebRTC.ts` | Add connectionStatus, connectionError, retryCall |
| `src/components/video/ConnectionStatusIndicator.tsx` | New component (create) |
| `src/components/video/index.ts` | Export new component |
| `src/pages/VideoCall.tsx` | Use ConnectionStatusIndicator, add retry |
| `src/pages/VideoCallStaff.tsx` | Use ConnectionStatusIndicator, add retry |

