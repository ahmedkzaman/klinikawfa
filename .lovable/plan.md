
# Plan: Fix Admin Tab Refresh Issue

## The Problem

When you switch to another browser tab and return, your admin page refreshes and you lose all your work. This is caused by:

1. **Auth token refresh** - When the browser tab regains focus, Supabase checks if your login session needs refreshing, which can trigger the page to reload
2. **Form state not saved** - Your blog post content is only stored temporarily in the browser and gets erased when the page reloads

## The Solution

We'll implement three fixes to ensure your work is preserved:

### Fix 1: Smarter Auth Handling

Prevent unnecessary page refreshes by only updating the app when you actually log in or out, not when the system is just refreshing your session in the background.

### Fix 2: Auto-Save Your Work

Automatically save your blog post draft to the browser's local storage every few seconds. If the page does refresh, your content will be restored automatically.

### Fix 3: Disable Automatic Data Refetching

Stop the app from automatically fetching fresh data every time you return to the tab.

---

## Technical Details

### File: `src/contexts/AuthContext.tsx`

Add a check to prevent unnecessary re-renders on token refresh:

```typescript
// Current behavior: ALL auth events trigger state updates
supabase.auth.onAuthStateChange((event, session) => {
  setSession(session);  // This always runs
  setUser(session?.user ?? null);
  // ...
});

// Fixed behavior: Ignore TOKEN_REFRESHED if session user is unchanged
supabase.auth.onAuthStateChange((event, session) => {
  // Skip if just a token refresh with same user
  if (event === 'TOKEN_REFRESHED' && session?.user?.id === user?.id) {
    return;
  }
  setSession(session);
  setUser(session?.user ?? null);
  // ...
});
```

### File: `src/pages/admin/BlogEditor.tsx`

Add auto-save functionality using browser storage:

| Feature | Implementation |
|---------|----------------|
| Save to browser storage | Every 2 seconds while typing |
| Restore on page load | Check storage before fetching from database |
| Clear storage | When post is successfully saved |
| Storage key | `blog-draft-{postId}` or `blog-draft-new` |

### File: `src/App.tsx`

Configure React Query to not refetch on window focus:

```typescript
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,  // Don't refetch when tab regains focus
      staleTime: 5 * 60 * 1000,     // Consider data fresh for 5 minutes
    },
  },
});
```

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/contexts/AuthContext.tsx` | Skip state updates on TOKEN_REFRESHED events |
| `src/pages/admin/BlogEditor.tsx` | Add auto-save to browser storage with restore |
| `src/App.tsx` | Configure React Query to avoid refetch on focus |

## User Experience After Fix

1. You can freely switch between browser tabs without losing your work
2. If the page does refresh for any reason, your draft will be automatically restored
3. A small indicator will show that your draft has been auto-saved
4. The restore will show a toast notification so you know your content was recovered
