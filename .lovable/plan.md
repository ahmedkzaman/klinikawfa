

# Plan: Fix "Staff Access Required" Error - Comprehensive Fix

## Root Cause Analysis

I traced through the entire authentication flow and found **two issues**:

1. **ProtectedRoute doesn't wait for roles**: The `ProtectedRoute` component only checks `loading` (session state) but doesn't wait for `rolesLoading` to complete. This causes premature access checks.

2. **Race condition on navigation**: When navigating to `/video-call/staff`, the ProtectedRoute and VideoCallStaff page both check `isStaffOrAdmin` before roles have finished loading.

---

## Current Flow (Broken)

```text
User clicks "Start Call"
        |
        v
Navigate to /video-call/staff
        |
        v
ProtectedRoute checks:
  - loading = false (session loaded)
  - isStaffOrAdmin = false (roles NOT loaded yet!)
        |
        v
Either: Redirect to / (from ProtectedRoute)
   or: "Staff access required" error (from VideoCallStaff)
```

---

## Solution

Update `ProtectedRoute` to also wait for `rolesLoading` before checking role-based access.

---

## Implementation Steps

### Step 1: Update ProtectedRoute to Wait for Roles

The ProtectedRoute currently only waits for `loading`. We need it to also wait for `rolesLoading` when role-based access is required.

**Changes to `src/components/ProtectedRoute.tsx`:**

```tsx
export function ProtectedRoute({ 
  children, 
  requireAdmin = false, 
  requireStaffOrAdmin = false 
}: ProtectedRouteProps) {
  const { user, loading, rolesLoading, isAdmin, isStaffOrAdmin } = useAuth();
  const location = useLocation();

  // Wait for BOTH session AND roles to load when role checks are needed
  const needsRoleCheck = requireAdmin || requireStaffOrAdmin;
  if (loading || (needsRoleCheck && rolesLoading)) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // ... rest of the checks
}
```

---

## Fixed Flow (After Implementation)

```text
User clicks "Start Call"
        |
        v
Navigate to /video-call/staff
        |
        v
ProtectedRoute checks:
  - loading = false (session loaded)
  - rolesLoading = true (roles loading...)
  - Shows loading spinner
        |
        v
Roles finish loading:
  - rolesLoading = false
  - isStaffOrAdmin = true
        |
        v
VideoCallStaff loads room data
        |
        v
Ready to start call!
```

---

## Technical Details

**File:** `src/components/ProtectedRoute.tsx`

Current code (lines 16-25):
```tsx
const { user, loading, isAdmin, isStaffOrAdmin } = useAuth();
const location = useLocation();

if (loading) {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );
}
```

Updated code:
```tsx
const { user, loading, rolesLoading, isAdmin, isStaffOrAdmin } = useAuth();
const location = useLocation();

// Wait for both session and roles when role-based access is required
const needsRoleCheck = requireAdmin || requireStaffOrAdmin;
if (loading || (needsRoleCheck && rolesLoading)) {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );
}
```

---

## Why This Fixes It

1. **AdminLayout** uses `<ProtectedRoute requireStaffOrAdmin>` - this now waits for roles
2. **VideoCallStaff** already waits for `rolesLoading` in its useEffect - but ProtectedRoute was redirecting before it could run
3. By fixing ProtectedRoute, the entire admin section properly waits for role verification

---

## Summary

The fix is a single change to `ProtectedRoute.tsx` to also consider `rolesLoading` when checking role-based access. This ensures users aren't redirected or shown errors before their roles have been verified.

