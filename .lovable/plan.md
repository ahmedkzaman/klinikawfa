
# Plan: Fix Room Link Copy Functionality for Video Calls

## Problem Summary
There are two issues preventing you from copying the room link:
1. The copy button next to the room code only copies the room code (e.g., "46Z3KS"), not the full patient link
2. The "Copy Link" option in the dropdown menu doesn't appear for test rooms

## Solution Overview
We'll improve the copy functionality to make it more intuitive and ensure test rooms can also have their links copied.

## Implementation Steps

### Step 1: Update Copy Button Behavior
Change the small copy button next to the room code to copy the **full patient link** instead of just the room code. This is the most common action staff would want.

**Changes to `VideoCallManagement.tsx`:**
- The copy icon button will call `copyPatientLink(room.room_code)` instead of `copyRoomCode(room.room_code)`
- This generates the full URL like `https://klinikawfa.lovable.app/video-call?room=46Z3KS`

### Step 2: Add "Copy Link" Option for Test Rooms
Update the dropdown menu to include test rooms when showing the "Copy Link" option.

**Current condition (line 430):**
```
room.status === 'pending' || room.status === 'paid' || room.status === 'active'
```

**Updated condition:**
```
room.status === 'pending' || room.status === 'paid' || room.status === 'active' || room.status === 'test'
```

### Step 3: Improve Toast Message Clarity
Update the toast message when copying to clearly show the copied URL or indicate it's ready to share with the patient.

## Visual Flow After Fix

```text
+------------------+
| Room List Table  |
+------------------+
| 46Z3KS [Copy] <------ Copies full patient link
|                       (https://.../video-call?room=46Z3KS)
+------------------+
| Dropdown Menu    |
| > Copy Link      | <--- Now also available for test rooms
+------------------+
```

## Technical Details

**File to modify:** `src/pages/admin/VideoCallManagement.tsx`

**Change 1** - Line 786: Update `onClick` handler
```tsx
// Before
onClick={() => copyRoomCode(room.room_code)}

// After  
onClick={() => copyPatientLink(room.room_code)}
```

**Change 2** - Line 430: Update condition to include test rooms
```tsx
// Before
{(room.status === 'pending' || room.status === 'paid' || room.status === 'active') && (

// After
{(room.status === 'pending' || room.status === 'paid' || room.status === 'active' || room.status === 'test') && (
```

## Testing Verification
After implementation:
1. Create a new test room using "Teleconsultation Test" button
2. Click the copy icon next to the room code
3. Verify the full URL is copied (paste to confirm)
4. Open the copied link in an incognito/different browser
5. Verify the patient can enter the room without payment
