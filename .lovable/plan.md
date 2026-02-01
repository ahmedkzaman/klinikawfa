
# Add Room Management Actions

## Problem
The Video Call Management page currently shows an empty "Actions" column for pending rooms. Staff cannot cancel unwanted rooms or manage them effectively.

## Solution
Add a dropdown menu in the Actions column with contextual options based on room status.

---

## What Actions Will Be Available

| Room Status | Available Actions |
|-------------|-------------------|
| **Pending** | Copy Link, Cancel Room |
| **Paid** | Start Call, Copy Link, Cancel Room |
| **Active** | Start Call (rejoin) |
| **Ended** | View Details |
| **Cancelled** | Delete Room |

---

## UI Design

The Actions column will show a dropdown menu (three dots icon) with contextual options:

```text
Actions Column (for Pending room)
┌──────────────────┐
│  ⋮  (dropdown)   │
├──────────────────┤
│ 📋 Copy Link     │
│ ❌ Cancel Room   │
│ 🗑️ Delete Room   │
└──────────────────┘

Actions Column (for Paid room)
┌──────────────────┐
│ [Start] ⋮        │  ← Start button + dropdown
├──────────────────┤
│ 📋 Copy Link     │
│ ❌ Cancel Room   │
└──────────────────┘
```

---

## Changes Required

### 1. Frontend: VideoCallManagement.tsx

**Add Cancel Room Function:**
```typescript
const cancelRoom = async (roomId: string) => {
  const { data: session } = await supabase.auth.getSession();
  
  await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/video-room?action=update-status`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ 
        room_id: roomId, 
        status: 'cancelled' 
      }),
    }
  );
  
  fetchRooms(); // Refresh list
};
```

**Add Delete Room Function (new endpoint needed):**
```typescript
const deleteRoom = async (roomId: string) => {
  // Call delete endpoint
  await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/video-room?action=delete`,
    { ... }
  );
};
```

**Update Actions Column:**
- Replace the single "Start" button with a dropdown menu
- Show contextual options based on room status
- Add confirmation dialog for cancel/delete actions

### 2. Backend: video-room Edge Function

**Add Delete Action:**
```typescript
// POST: Delete room (only for cancelled/ended rooms)
if (req.method === "POST" && action === "delete") {
  const { room_id } = await req.json();
  
  // Verify room is in deletable state
  const { data: room } = await supabaseClient
    .from("video_rooms")
    .select("status")
    .eq("id", room_id)
    .single();
  
  if (!['cancelled', 'ended'].includes(room?.status)) {
    return error("Can only delete cancelled or ended rooms");
  }
  
  // Delete related payments first, then room
  await supabaseClient.from("video_payments").delete().eq("room_id", room_id);
  await supabaseClient.from("video_rooms").delete().eq("id", room_id);
}
```

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/pages/admin/VideoCallManagement.tsx` | Add dropdown menu, cancel/delete functions, confirmation dialogs |
| `supabase/functions/video-room/index.ts` | Add delete action endpoint |

---

## Implementation Steps

1. Update the edge function to support room deletion
2. Add `cancelRoom` and `deleteRoom` functions to the component
3. Replace the Actions column with a dropdown menu component
4. Add confirmation dialogs for destructive actions
5. Add bilingual labels (Malay/English)
6. Test all actions

---

## Confirmation Dialog

For cancel and delete actions, users will see a confirmation dialog:

```text
┌─────────────────────────────────────────┐
│  Cancel Video Room?                     │
├─────────────────────────────────────────┤
│  Are you sure you want to cancel the    │
│  room for "Ahmed"?                      │
│                                         │
│  This action cannot be undone. The      │
│  patient will not be able to join.      │
│                                         │
│         [Keep Room]  [Cancel Room]      │
└─────────────────────────────────────────┘
```

---

## Technical Notes

- Uses the existing `update-status` endpoint to change status to `cancelled`
- Only cancelled/ended rooms can be permanently deleted
- All actions require staff/admin authentication
- Dropdown uses existing Radix UI DropdownMenu component

