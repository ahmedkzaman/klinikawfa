

## Independent Sidebar Scrolling

### Problem
The sidebar and main content share the same scroll context, so scrolling the sidebar also scrolls the content area and vice versa.

### Fix
In `src/components/staff/StaffLayout.tsx`:

1. **Desktop sidebar**: Already has `sticky top-0 h-screen`. Add `overflow-y-auto` to the nav area so it scrolls independently within the fixed sidebar height.

2. **Mobile sidebar (Sheet)**: Add `overflow-y-auto` to the nav container inside SheetContent.

3. **Main content area**: Add `overflow-y-auto` to the right-side container so it scrolls independently.

### Changes

**Edit: `src/components/staff/StaffLayout.tsx`**
- Desktop `<aside>`: wrap `SidebarNav` + footer in a flex column with `overflow-y-auto flex-1` on the nav section
- Mobile `SheetContent`: add `overflow-y-auto` to the nav wrapper
- Main content `<div className="flex-1 flex flex-col">`: add `overflow-y-auto h-screen`

Single file edit, ~5 lines changed.

