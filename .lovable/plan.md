

# Plan: Fix Supabase Realtime Channel TIMED_OUT Error

## Problem Analysis

The video call is failing with "Failed to join signaling channel: TIMED_OUT" because the Supabase Realtime channel subscription is timing out. This is a Realtime service issue, not a WebRTC issue.

### Root Cause Investigation

The current implementation uses Supabase Realtime with:
- **Presence tracking** (staff/patient join/leave detection)
- **Broadcast events** (offer, answer, ICE candidates)

The `TIMED_OUT` status from Supabase Realtime indicates the WebSocket connection to Supabase couldn't be established or maintained.

### Common Causes

1. **Network/firewall blocking WebSocket connections**
2. **Supabase Realtime service temporarily unavailable**
3. **Channel configuration issues**
4. **Browser/device network restrictions**

---

## Solution

Implement multiple improvements to make the signaling more robust:

### 1. Add Retry Logic for Channel Subscription

Instead of failing immediately on TIMED_OUT, implement automatic retry with exponential backoff:

```text
Attempt 1: Try to subscribe
  -> TIMED_OUT
  -> Wait 2 seconds

Attempt 2: Try to subscribe again
  -> TIMED_OUT  
  -> Wait 4 seconds

Attempt 3: Try to subscribe again
  -> Success or final failure
```

### 2. Better Connection State Handling

Add more granular error handling for different Realtime states:
- `TIMED_OUT` - Retry with backoff
- `CHANNEL_ERROR` - Log details and provide actionable error
- `CLOSED` - Attempt reconnection

### 3. Add Health Check Before Subscription

Before attempting to join the signaling channel, perform a quick health check to verify:
- Network connectivity
- Supabase is reachable

### 4. Improved Error Messages

Provide clearer error messages that help users troubleshoot:
- Check internet connection
- Try refreshing the page
- Try a different network (mobile data vs WiFi)

---

## Implementation Details

### File: `src/hooks/useWebRTC.ts`

**Changes:**

1. **Add retry mechanism with exponential backoff:**
   ```typescript
   const MAX_RETRY_ATTEMPTS = 3;
   const INITIAL_RETRY_DELAY = 2000;
   
   const setupSignalingWithRetry = async (pc: RTCPeerConnection): Promise<void> => {
     let attempts = 0;
     let lastError: Error | null = null;
     
     while (attempts < MAX_RETRY_ATTEMPTS) {
       try {
         await setupSignaling(pc);
         return; // Success
       } catch (err) {
         lastError = err as Error;
         attempts++;
         
         if (attempts < MAX_RETRY_ATTEMPTS) {
           const delay = INITIAL_RETRY_DELAY * Math.pow(2, attempts - 1);
           console.log(`[WebRTC] Retry attempt ${attempts} in ${delay}ms...`);
           await new Promise(resolve => setTimeout(resolve, delay));
         }
       }
     }
     
     throw lastError;
   };
   ```

2. **Handle specific Realtime status codes:**
   ```typescript
   .subscribe(async (status, err) => {
     if (status === 'SUBSCRIBED') {
       // Success
     } else if (status === 'TIMED_OUT') {
       reject(new Error('Connection timed out. Please check your internet connection and try again.'));
     } else if (status === 'CHANNEL_ERROR') {
       const errorDetails = err?.message || 'Unknown channel error';
       reject(new Error(`Connection error: ${errorDetails}`));
     }
   });
   ```

3. **Add connection health check:**
   ```typescript
   const checkConnection = async (): Promise<boolean> => {
     try {
       // Simple fetch to check if Supabase is reachable
       const response = await fetch(`${SUPABASE_URL}/rest/v1/`, {
         method: 'HEAD',
         headers: { 'apikey': SUPABASE_ANON_KEY }
       });
       return response.ok;
     } catch {
       return false;
     }
   };
   ```

4. **Update connection status messages:**
   - Add `'retrying'` status to show retry attempts
   - Update `ConnectionStatusIndicator` to display retry information

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/hooks/useWebRTC.ts` | Add retry logic, health check, better error handling |
| `src/components/video/ConnectionStatusIndicator.tsx` | Add retry status display, show retry count |

---

## Technical Summary

The fix addresses the TIMED_OUT error by:

1. **Retry mechanism** - Automatically retry channel subscription up to 3 times with exponential backoff (2s, 4s, 8s delays)

2. **Better error handling** - Parse Supabase Realtime status codes and provide specific, actionable error messages

3. **Connection verification** - Check network connectivity before attempting signaling

4. **User feedback** - Show retry progress in the UI so users know the system is still trying

This approach is resilient to temporary network issues and provides better UX when connections are unstable.

