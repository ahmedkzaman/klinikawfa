## Problem

On phone and tablet, the staff portal sidebar (opened from the menu button) cannot scroll. Long sections like Admin and Website get clipped at the bottom and are unreachable.

## Root cause

In `src/components/staff/StaffLayout.tsx`, the mobile `<SheetContent>` contains three stacked children:

1. Header (logo + Open Clinic button)
2. Scroll area (`flex-1 overflow-y-auto` wrapping `SidebarNav`)
3. Footer (email + Sign Out)

But `SheetContent` itself is not a flex column with a constrained height, so `flex-1` on the middle div collapses to its content height instead of filling the remaining space. The nav grows past the viewport and the page can't scroll because `overflow-y-auto` only applies to that middle div, which has no bounded height.

## Fix

Add `flex flex-col h-full` to the mobile `SheetContent`, so the three stacked sections behave as a proper column: fixed header, scrollable middle, fixed footer.

```text
SheetContent (h-full, flex-col)
├── header        (shrink-0)
├── scroll area   (flex-1, overflow-y-auto)  ← becomes scrollable
└── footer        (shrink-0)
```

Also explicitly mark the header as `shrink-0` for safety (the footer already is).

## Files to change

- `src/components/staff/StaffLayout.tsx` — add `flex flex-col h-full` to the mobile `SheetContent`, add `shrink-0` to its header wrapper.

## Out of scope

- Desktop sidebar layout (already works: `aside` is `flex flex-col h-screen` with an inner `flex-1 overflow-y-auto`).
- Any visual redesign of the sidebar — only the scroll behavior is fixed.
