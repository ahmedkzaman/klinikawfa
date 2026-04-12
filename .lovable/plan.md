

## Fix: Prevent Page Reset on Browser Tab Switch

### Root Cause

When you switch tabs and return, Supabase fires auth events (e.g., `SIGNED_IN` after token refresh). The current AuthContext filter only skips `TOKEN_REFRESHED` and `INITIAL_SESSION` — but `SIGNED_IN` events with the same user ID still pass through, calling `setUser()` with a new object reference. This causes `StaffLayout` to re-render with `noticesLoading` resetting to `true`, which triggers the full-page loading spinner at line 229.

### Fix

**1. AuthContext.tsx** — Also skip `SIGNED_IN` events when user ID hasn't changed:

```typescript
if (
  authInitializedRef.current &&
  newUserId === currentUserIdRef.current
) {
  // Update session silently (for fresh tokens) without triggering re-renders
  return;
}
```

This catches ALL redundant events regardless of event type, not just TOKEN_REFRESHED and INITIAL_SESSION.

**2. StaffLayout.tsx** — Don't reset `noticesLoading` on re-renders:

- Use a ref to track whether notices have been fetched at least once
- Only show loading spinner on initial load, not on subsequent re-fetches
- This provides a safety net even if auth state does update

### Files Changed

- `src/contexts/AuthContext.tsx` — broaden the skip condition
- `src/components/staff/StaffLayout.tsx` — prevent loading state flash on re-render

