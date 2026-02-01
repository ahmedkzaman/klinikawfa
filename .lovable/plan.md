

# Plan: Improve Mobile Video Call Layout

## Problem

During a video call on mobile (handphone), the camera and microphone buttons are not visible. The current layout is not optimized for small screens, causing:
- Call controls to be cut off or hidden below the fold
- Video grid taking too much space
- Poor use of limited screen real estate

## Current Layout Analysis

**Patient View (VideoCall.tsx - 'in-call' step):**
```
+---------------------------+
|        Timer Section      |  <- Takes full width, stacked vertically
+---------------------------+
|                           |
|     Remote Video          |  <- min-h-[300px]
|     (Doctor)              |
|                           |
+---------------------------+
|                           |
|     Local Video           |  <- min-h-[300px]
|     (You)                 |
|                           |
+---------------------------+
|      Call Controls        |  <- May be off-screen!
+---------------------------+
```

**Problems:**
1. Two video players at 300px each = 600px minimum
2. Timer section takes additional space (~120px)
3. MainLayout header/footer takes ~100px
4. Call controls at bottom may be pushed below viewport
5. Controls have no safe area / fixed positioning on mobile

## Solution

Create a mobile-optimized layout with:
1. **Fixed bottom controls** - Always visible call controls bar
2. **Picture-in-picture style** - Small local video overlay on remote video
3. **Compact timer** - Smaller, inline timer for mobile
4. **Safe area padding** - Account for device notches/home indicators

### New Mobile Layout

```
+---------------------------+
|  Timer (compact inline)   |
+---------------------------+
|                           |
|                           |
|     Remote Video          |
|     (Full screen)         |
|        +-------+          |
|        | Local |          |
|        | Video |          |
|        +-------+          |
|                           |
+---------------------------+
| [Mic] [Video] [End Call]  |  <- Fixed position bottom
+---------------------------+
```

---

## Implementation Details

### 1. Create Mobile Video Call Layout Component

**New File: `src/components/video/MobileCallLayout.tsx`**

A specialized layout component for mobile video calls:
- Uses `useIsMobile()` hook to detect mobile
- Fixed bottom control bar with safe area insets
- Local video as small overlay (picture-in-picture)
- Remote video takes full remaining height
- Compact timer at top

```typescript
interface MobileCallLayoutProps {
  remoteStream: MediaStream | null;
  localStream: MediaStream | null;
  timer: { formattedTime: string; totalMinutes: number; ... };
  controls: {
    isAudioEnabled: boolean;
    isVideoEnabled: boolean;
    isConnected: boolean;
    isConnecting: boolean;
    onToggleAudio: () => void;
    onToggleVideo: () => void;
    onEndCall: () => void;
  };
  connectionStatus: ConnectionStatus;
  // ... other props
}
```

### 2. Update CallControls for Mobile

**File: `src/components/video/CallControls.tsx`**

Add mobile-specific styling:
- Larger touch targets (48px buttons)
- Fixed positioning option
- Higher z-index
- Safe area bottom padding

### 3. Update VideoCall.tsx and VideoCallStaff.tsx

**Files to modify:**
- `src/pages/VideoCall.tsx`
- `src/pages/VideoCallStaff.tsx`

Integrate mobile-responsive layout:
- Detect mobile using `useIsMobile()` hook
- Render `MobileCallLayout` for mobile screens
- Keep desktop layout for larger screens

### 4. Add Compact Timer for Mobile

**File: `src/components/video/CallTimer.tsx`**

Add `compact` prop for mobile display:
- Single line layout
- Smaller text
- No extra details on mobile

---

## Files to Create/Modify

| File | Action | Changes |
|------|--------|---------|
| `src/components/video/MobileCallLayout.tsx` | CREATE | New mobile-optimized video call layout |
| `src/components/video/CallControls.tsx` | MODIFY | Add fixed position option, larger touch targets |
| `src/components/video/CallTimer.tsx` | MODIFY | Add compact mode for mobile |
| `src/components/video/index.ts` | MODIFY | Export MobileCallLayout |
| `src/pages/VideoCall.tsx` | MODIFY | Use MobileCallLayout on mobile |
| `src/pages/VideoCallStaff.tsx` | MODIFY | Use MobileCallLayout on mobile |

---

## Technical Details

### Mobile Layout CSS

```css
/* Fixed bottom controls */
.mobile-controls {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 16px;
  padding-bottom: env(safe-area-inset-bottom, 16px);
  background: rgba(0, 0, 0, 0.8);
  backdrop-filter: blur(8px);
  z-index: 50;
}

/* Local video overlay (picture-in-picture) */
.local-video-pip {
  position: absolute;
  bottom: 80px; /* Above controls */
  right: 16px;
  width: 100px;
  height: 140px;
  border-radius: 12px;
  overflow: hidden;
  border: 2px solid white;
  box-shadow: 0 4px 12px rgba(0,0,0,0.3);
}
```

### Touch-Friendly Button Sizes

- Minimum touch target: 48x48px (WCAG requirement)
- Current buttons: 48x48px (good for mic/video)
- End call button: 56x56px (larger for primary action)

### Safe Area Handling

Using CSS `env()` for device safe areas:
```css
padding-bottom: calc(16px + env(safe-area-inset-bottom));
```

---

## Summary

This plan transforms the mobile video call experience by:

1. **Fixed controls** - Call buttons always visible at bottom
2. **Full-screen remote video** - Maximizes the doctor/patient view
3. **PiP local video** - Small overlay showing yourself
4. **Compact timer** - Minimal space usage at top
5. **Touch-friendly** - Large buttons easy to tap
6. **Safe areas** - Works on notched devices (iPhone, etc.)

The desktop layout remains unchanged - only mobile screens get the optimized layout.

