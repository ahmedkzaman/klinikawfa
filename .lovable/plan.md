

# Plan: Fix "Staff Access Required" Error for Video Calls

## Problem Analysis

You're seeing "Staff access required" error even though you have admin role. This is caused by a **timing issue**:

1. When you navigate to the Video Call page, it immediately checks if you're staff/admin
2. But roles are loaded **asynchronously** after the session is confirmed
3. The page checks the role before it's been fetched from the database

Your user (Ahmed) definitely has the admin role in the database, so the check should pass - it's just happening too early.

---

## Solution

Add a "roles loading" state to the AuthContext and update the VideoCallStaff page to wait for both session AND roles to finish loading before performing the access check.

---

## Implementation Steps

### Step 1: Add rolesLoading State to AuthContext

Track when roles are still being fetched separately from session loading.

**Changes to `src/contexts/AuthContext.tsx`:**
- Add new `rolesLoading` state (starts as `true`)
- Set `rolesLoading = true` before fetching roles
- Set `rolesLoading = false` after roles are fetched (or if no user)
- Export `rolesLoading` in the context

### Step 2: Update VideoCallStaff to Wait for Roles

The page should show a loading spinner until both `loading` (session) AND `rolesLoading` are complete.

**Changes to `src/pages/VideoCallStaff.tsx`:**
- Get `rolesLoading` from `useAuth()`
- Wait for `loading || rolesLoading` to be false before checking `isStaffOrAdmin`
- Update the useEffect dependency to include loading states

---

## Technical Details

**File 1:** `src/contexts/AuthContext.tsx`

```tsx
// Add new state
const [rolesLoading, setRolesLoading] = useState(true);

// Update fetchUserRoles
const fetchUserRoles = useCallback(async (userId: string) => {
  setRolesLoading(true);
  try {
    // ... existing fetch code ...
  } finally {
    setRolesLoading(false);
  }
}, []);

// Handle case when no user
if (!session?.user) {
  setRolesLoading(false);
}

// Add to context value
rolesLoading,
```

**File 2:** `src/pages/VideoCallStaff.tsx`

```tsx
const { user, isStaffOrAdmin, loading, rolesLoading } = useAuth();

useEffect(() => {
  const loadRoom = async () => {
    // Wait for auth to fully load
    if (loading || rolesLoading) return;
    
    // ... rest of the logic
  };
  
  loadRoom();
}, [roomCode, isStaffOrAdmin, loading, rolesLoading]);
```

---

## Visual Flow After Fix

```text
User clicks "Start Call"
        ↓
  Page loads → Shows loading spinner
        ↓
  Session loaded (loading = false)
        ↓
  Roles being fetched (rolesLoading = true)
        ↓
  Roles loaded (rolesLoading = false)
        ↓
  isStaffOrAdmin = true ✓
        ↓
  Room data loaded → Ready to start call
```

---

## Summary

This fix ensures the access check only happens after roles are fully loaded, preventing the false "Staff access required" error for admin and staff users.

