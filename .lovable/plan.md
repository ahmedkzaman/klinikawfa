

# Plan: Fix "Requested Device Not Found" Error

## Problem

The error "Ralat - Requested device not found" occurs when:
1. The user's device has no camera or microphone connected
2. The camera/microphone is being used by another application
3. Permission was denied or the device is unavailable

Currently, the code requires **both** video AND audio devices to be available, which fails completely if either is missing.

---

## Solution

Improve media device handling to:
1. **Gracefully fallback** to audio-only or video-only mode if one device is unavailable
2. **Provide better error messages** explaining exactly what's wrong
3. **Check device availability** before requesting them
4. **Allow retry** with different device constraints

---

## Implementation Steps

### Step 1: Enhance `initializeMedia()` with Fallback Logic

Instead of failing completely, try different combinations:

```typescript
const initializeMedia = async () => {
  try {
    console.log('[WebRTC] Initializing media devices...');
    
    // First, enumerate available devices
    const devices = await navigator.mediaDevices.enumerateDevices();
    const hasVideo = devices.some(d => d.kind === 'videoinput');
    const hasAudio = devices.some(d => d.kind === 'audioinput');
    
    if (!hasVideo && !hasAudio) {
      throw new Error('No camera or microphone found. Please connect a device and try again.');
    }
    
    // Request only available device types
    const constraints = {
      video: hasVideo,
      audio: hasAudio,
    };
    
    console.log('[WebRTC] Requesting media with constraints:', constraints);
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    
    localStreamRef.current = stream;
    setLocalStream(stream);
    setIsVideoEnabled(hasVideo);
    setIsAudioEnabled(hasAudio);
    
    // Warn user if only partial devices available
    if (!hasVideo) {
      onError?.('No camera found. Audio-only mode enabled.');
    } else if (!hasAudio) {
      onError?.('No microphone found. Video-only mode enabled.');
    }
    
    return stream;
  } catch (err) {
    console.error('[WebRTC] Failed to get media devices:', err);
    
    // Provide specific error messages based on error type
    const error = err as Error;
    if (error.name === 'NotFoundError' || error.message.includes('Requested device not found')) {
      onError?.('Camera/microphone not found. Please connect a device and check permissions.');
    } else if (error.name === 'NotAllowedError') {
      onError?.('Camera/microphone permission denied. Please allow access in your browser settings.');
    } else if (error.name === 'NotReadableError') {
      onError?.('Camera/microphone is in use by another application. Please close other apps and try again.');
    } else {
      onError?.(error.message || 'Failed to access camera/microphone.');
    }
    
    throw err;
  }
};
```

### Step 2: Update State for Partial Device Availability

Track which devices are actually available:

```typescript
// Add state to track actual device availability
const [hasCamera, setHasCamera] = useState(true);
const [hasMicrophone, setHasMicrophone] = useState(true);
```

### Step 3: Provide Bilingual Error Messages

Update error messages to support Malay language:

```typescript
// In the error callback in VideoCall.tsx and VideoCallStaff.tsx
const getLocalizedError = (error: string) => {
  if (language === 'ms') {
    if (error.includes('not found')) return 'Kamera/mikrofon tidak dijumpai. Sila sambungkan peranti.';
    if (error.includes('permission denied')) return 'Kebenaran kamera/mikrofon ditolak. Sila benarkan akses.';
    if (error.includes('in use')) return 'Kamera/mikrofon sedang digunakan oleh aplikasi lain.';
  }
  return error;
};
```

---

## Files to Modify

1. **`src/hooks/useWebRTC.ts`**:
   - Add device enumeration before getUserMedia
   - Implement fallback logic for missing devices
   - Provide detailed error messages based on error type

---

## Summary

The fix will:
- Check what devices are available before requesting them
- Fallback to audio-only or video-only if one device is missing
- Provide clear, actionable error messages in both English and Malay
- Handle the "Requested device not found" error gracefully

